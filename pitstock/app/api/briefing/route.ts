import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { fetchNewsForStocks, fetchEconomicNews } from "@/lib/naver-news";
import { generateScript, generateStockScript, generateCommonScript, generateClosingScript } from "@/lib/generate-script";
import { synthesizeSpeech, synthesizeSegmentToPCM, combinePCMToWav } from "@/lib/tts";
import {
  readManifest,
  readSegmentPCM,
  readSegmentMeta,
  getCommonPath,
  getClosingPath,
  getStockPath,
  stockSegmentExists,
  writeSegment,
  findLatestBriefingDate,
} from "@/lib/briefing-store";
import type { GlossaryItem } from "@/lib/generate-script";
import type { SegmentMeta } from "@/lib/briefing-store";

function getKSTDateString(): string {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + kstOffset + now.getTimezoneOffset() * 60 * 1000);
  return kst.toISOString().split("T")[0];
}

export async function POST(request: NextRequest) {
  // 1. 세션 검증
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  // 2. 요청 바디 파싱
  const body = await request.json();
  const stocks: string[] = body.stocks;

  if (!Array.isArray(stocks) || stocks.length === 0) {
    return Response.json(
      { error: "종목 목록이 필요합니다." },
      { status: 400 },
    );
  }

  try {
    const date = getKSTDateString();
    const manifest = await readManifest(date);

    // 오늘자 캐시 확인
    if (manifest && manifest.status === "complete") {
      console.log(`[briefing] Cache hit for ${date}`);
      return await assembleFromCache(date, stocks, manifest.stocks);
    }

    // 오늘 캐시 없으면 가장 최근 캐시 사용
    const latestDate = await findLatestBriefingDate();
    if (latestDate) {
      const latestManifest = await readManifest(latestDate);
      if (latestManifest && latestManifest.status === "complete") {
        console.log(`[briefing] Using latest cache from ${latestDate}`);
        return await assembleFromCache(latestDate, stocks, latestManifest.stocks);
      }
    }

    // 캐시가 아예 없으면 온디맨드 생성 (최초 사용 등)
    console.log(`[briefing] No cache available, generating on-the-fly`);
    return await generateOnTheFly(stocks);
  } catch (err) {
    console.error("Briefing generation error:", err);
    const message = err instanceof Error ? err.message : "브리핑 생성 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}

// 캐시에서 세그먼트 조립
async function assembleFromCache(date: string, userStocks: string[], cachedStocks: string[]) {
  const pcmBuffers: Buffer[] = [];
  const scripts: string[] = [];
  const glossaryMap = new Map<string, GlossaryItem>();

  const addGlossary = (items: GlossaryItem[]) => {
    for (const item of items) {
      if (!glossaryMap.has(item.term)) {
        glossaryMap.set(item.term, item);
      }
    }
  };

  // 공통 세그먼트
  const commonPCM = await readSegmentPCM(getCommonPath(date));
  const commonMeta = await readSegmentMeta(getCommonPath(date));
  pcmBuffers.push(commonPCM);
  scripts.push(commonMeta.script);
  addGlossary(commonMeta.glossary);

  // 종목별 세그먼트
  for (const stock of userStocks) {
    if (cachedStocks.includes(stock) && await stockSegmentExists(date, stock)) {
      // 캐시에서 읽기
      const stockPCM = await readSegmentPCM(getStockPath(date, stock));
      const stockMeta = await readSegmentMeta(getStockPath(date, stock));
      pcmBuffers.push(stockPCM);
      scripts.push(stockMeta.script);
      addGlossary(stockMeta.glossary);
    } else {
      // 캐시에 없는 종목: 온디맨드 생성
      console.log(`[briefing] On-demand generation for ${stock}`);
      const onDemand = await generateStockOnDemand(date, stock, userStocks);
      pcmBuffers.push(onDemand.pcm);
      scripts.push(onDemand.meta.script);
      addGlossary(onDemand.meta.glossary);
    }
  }

  // 클로징 세그먼트
  const closingPCM = await readSegmentPCM(getClosingPath(date));
  const closingMeta = await readSegmentMeta(getClosingPath(date));
  pcmBuffers.push(closingPCM);
  scripts.push(closingMeta.script);
  addGlossary(closingMeta.glossary);

  // 조립
  const audioBase64 = combinePCMToWav(pcmBuffers);
  const script = scripts.join("\n\n");
  const glossary = Array.from(glossaryMap.values());

  return Response.json({ script, audioBase64, glossary });
}

// 캐시 미스 종목의 온디맨드 생성
async function generateStockOnDemand(
  date: string,
  stock: string,
  allUserStocks: string[],
): Promise<{ pcm: Buffer; meta: SegmentMeta }> {
  const { fetchNewsForStock, fetchEconomicNews } = await import("@/lib/naver-news");

  const [stockNewsResult, economicNews] = await Promise.all([
    fetchNewsForStock(stock),
    fetchEconomicNews(),
  ]);

  // 다른 종목 뉴스도 가져와서 대체 로직 컨텍스트 제공
  const otherStocks = allUserStocks.filter((s) => s !== stock);
  const otherNews = otherStocks.length > 0
    ? await Promise.all(otherStocks.slice(0, 3).map((s) => fetchNewsForStock(s)))
    : [];

  const allNewsContext = [stockNewsResult, ...otherNews];

  // 시장 데이터 조회 (실패해도 뉴스만으로 진행)
  let marketDataText: string | undefined;
  try {
    const { getStockCode } = await import("@/lib/stocks");
    const { fetchStockMarketData, formatMarketDataForPrompt } = await import("@/lib/kis-api");
    const code = getStockCode(stock);
    if (code) {
      const marketData = await fetchStockMarketData(code);
      marketDataText = formatMarketDataForPrompt(marketData);
    }
  } catch {
    // KIS API 실패해도 뉴스만으로 진행
  }

  const result = await generateStockScript(stock, stockNewsResult, allNewsContext, economicNews, marketDataText);
  const pcm = await synthesizeSegmentToPCM(result.script);

  // 캐시에도 저장 (다른 유저 요청 시 재사용)
  try {
    await writeSegment(getStockPath(date, stock), pcm, result);
  } catch {
    // 저장 실패해도 응답에는 영향 없음
  }

  return { pcm, meta: result };
}

// 기존 온디맨드 방식 (폴백)
async function generateOnTheFly(stocks: string[]) {
  const [newsData, economicNews] = await Promise.all([
    fetchNewsForStocks(stocks),
    fetchEconomicNews(),
  ]);

  const { script, glossary } = await generateScript(newsData, economicNews);
  const audioBase64 = await synthesizeSpeech(script);

  return Response.json({ script, audioBase64, glossary });
}
