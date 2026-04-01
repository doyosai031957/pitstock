import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { fetchNewsForStocks, fetchEconomicNews } from "@/lib/naver-news";
import { generateStockScript, generateCommonScript, generateClosingScript } from "@/lib/generate-script";
import { synthesizeSegmentToPCMClova, combinePCMToWav } from "@/lib/tts";
import type { GlossaryItem, ScriptResult } from "@/lib/generate-script";

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
    // Lab 모드: 항상 새로 생성 (캐시 사용 안 함)
    // 실서비스에서는 캐시 로직 활성화 필요
    console.log(`[briefing] Lab mode — generating fresh`);
    return await generateOnTheFly(stocks);
  } catch (err) {
    console.error("Briefing generation error:", err);
    const message = err instanceof Error ? err.message : "브리핑 생성 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}

// 온디맨드 생성 (Clova TTS only)
async function generateOnTheFly(stocks: string[]) {
  const [newsData, economicNews] = await Promise.all([
    fetchNewsForStocks(stocks),
    fetchEconomicNews(),
  ]);

  const scripts: string[] = [];
  const glossaryMap = new Map<string, GlossaryItem>();
  const addGlossary = (items: GlossaryItem[]) => {
    for (const item of items) {
      if (!glossaryMap.has(item.term)) glossaryMap.set(item.term, item);
    }
  };

  // === 1단계: 스크립트 생성 ===
  type ScriptSegment = { key: string; result: ScriptResult };
  const segments: ScriptSegment[] = [];

  // 공통 스크립트
  const commonResult = await generateCommonScript(economicNews);
  segments.push({ key: "common", result: commonResult });

  // 종목별 스크립트
  for (const stock of stocks) {
    const stockNews = newsData.find((n) => n.stock === stock) || { stock, articles: [] };

    let marketDataText: string | undefined;
    try {
      const { getStockCode } = await import("@/lib/stocks");
      const { fetchStockMarketData, formatMarketDataForPrompt } = await import("@/lib/kis-api");
      const code = getStockCode(stock);
      if (code) {
        const marketData = await fetchStockMarketData(code);
        marketDataText = formatMarketDataForPrompt(marketData);
      }
    } catch {}

    const result = await generateStockScript(stock, stockNews, newsData, economicNews, marketDataText);
    segments.push({ key: stock, result });
  }

  // 클로징 스크립트
  const closingResult = await generateClosingScript(stocks);
  segments.push({ key: "closing", result: closingResult });

  // 스크립트/용어/검증 취합
  const allValidation: { segment: string; issues: { rule: string; severity: string; message: string }[] }[] = [];
  for (const seg of segments) {
    scripts.push(seg.result.script);
    addGlossary(seg.result.glossary);
    if (seg.result.validation && seg.result.validation.length > 0) {
      allValidation.push({ segment: seg.key, issues: seg.result.validation });
    }
  }

  // === 2단계: Clova TTS ===
  const pcmBuffers: Buffer[] = [];
  for (const seg of segments) {
    pcmBuffers.push(await synthesizeSegmentToPCMClova(seg.result.script));
  }
  const audioBase64 = combinePCMToWav(pcmBuffers);

  const script = scripts.join("\n\n");
  const glossary = Array.from(glossaryMap.values());

  return Response.json({ script, audioBase64, glossary, validation: allValidation });
}
