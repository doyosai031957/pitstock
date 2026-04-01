/**
 * 브리핑 사전 생성 모듈
 *
 * 전체 흐름:
 * 1. 모든 유저의 관심종목 수집 (중복 제거)
 * 2. 네이버 뉴스 + 경제 뉴스 일괄 수집
 * 3. 한국투자증권 API로 종목별 시세/수급 데이터 수집
 * 4. 공통 스크립트 (경제 브리핑) 생성 → TTS → PCM 저장
 * 5. 종목별 스크립트 생성 → TTS → PCM 저장 (동시 3개씩)
 * 6. 클로징 스크립트 생성 → TTS → PCM 저장
 *
 * 저장 구조: data/briefing/{YYYY-MM-DD}/
 *   ├── manifest.json (상태, 생성 시각, 종목 목록)
 *   ├── common.pcm + .json
 *   ├── closing.pcm + .json
 *   └── stocks/{종목명}.pcm + .json
 *
 * 유저 요청 시 POST /api/briefing에서 해당 유저의 종목 PCM만 조립하여 WAV 반환
 */
import { fetchNewsForStocks, fetchEconomicNewsScheduled } from "./naver-news";
import type { StockNews, NewsItem } from "./naver-news";
import { generateCommonScript, generateStockScript, generateClosingScript } from "./generate-script";
import { synthesizeSegmentToPCM } from "./tts";
import {
  initBriefingDir,
  writeManifest,
  writeSegment,
  getCommonPath,
  getClosingPath,
  getStockPath,
  getAllUserStocks,
  cleanOldBriefings,
} from "./briefing-store";
import { getStockCode } from "./stocks";
import { fetchStockMarketData, formatMarketDataForPrompt } from "./kis-api";
import type { StockMarketData } from "./kis-api";

function getKSTDateString(): string {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + kstOffset + now.getTimezoneOffset() * 60 * 1000);
  return kst.toISOString().split("T")[0]; // YYYY-MM-DD
}

// 동시 실행 제한 (rate limit 방지)
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map((fn) => fn()));
    results.push(...batchResults);
  }
  return results;
}

export async function preGenerateBriefing(): Promise<{
  date: string;
  stockCount: number;
  failed: string[];
}> {
  const date = getKSTDateString();

  console.log(`[pre-generate] Starting briefing generation for ${date}`);

  // 1. 폴더 생성 + manifest 초기화
  await initBriefingDir(date);
  await writeManifest(date, {
    status: "generating",
    generatedAt: new Date().toISOString(),
    stocks: [],
  });

  // 2. 전체 유저 관심종목 수집
  const allStocks = await getAllUserStocks();
  console.log(`[pre-generate] Unique stocks across all users: ${allStocks.join(", ")}`);

  if (allStocks.length === 0) {
    await writeManifest(date, {
      status: "complete",
      generatedAt: new Date().toISOString(),
      stocks: [],
    });
    return { date, stockCount: 0, failed: [] };
  }

  // 3. 뉴스 수집 + 시장 데이터 수집
  const [allNewsData, economicNews] = await Promise.all([
    fetchNewsForStocks(allStocks),
    fetchEconomicNewsScheduled(),
  ]);
  console.log(`[pre-generate] News fetched: ${allNewsData.length} stocks, ${economicNews.length} economic articles`);

  // 3-1. 한국투자증권 시장 데이터 수집
  const marketDataMap = new Map<string, StockMarketData>();
  for (const stock of allStocks) {
    const code = getStockCode(stock);
    if (!code) {
      console.log(`[pre-generate] No stock code for ${stock}, skipping market data`);
      continue;
    }
    try {
      const data = await fetchStockMarketData(code);
      marketDataMap.set(stock, data);
      // KIS API rate limit 방지
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (err) {
      console.error(`[pre-generate] KIS data failed for ${stock} (${code}):`, err);
    }
  }
  console.log(`[pre-generate] Market data fetched: ${marketDataMap.size}/${allStocks.length} stocks`);

  // 4. 공통 스크립트 생성 + TTS
  console.log(`[pre-generate] Generating common script...`);
  const commonResult = await generateCommonScript(economicNews);
  const commonPCM = await synthesizeSegmentToPCM(commonResult.script);
  await writeSegment(getCommonPath(date), commonPCM, commonResult);
  console.log(`[pre-generate] Common segment saved (${commonResult.script.length} chars)`);

  // 5. 종목별 스크립트 생성 + TTS (동시 3개씩)
  const failed: string[] = [];
  const stockTasks = allStocks.map((stock) => {
    const stockNews = allNewsData.find((n) => n.stock === stock) || { stock, articles: [] };
    const marketData = marketDataMap.get(stock);
    const marketDataText = marketData ? formatMarketDataForPrompt(marketData) : undefined;
    return async () => {
      console.log(`[pre-generate] Generating stock script: ${stock}`);
      const result = await generateStockScript(stock, stockNews, allNewsData, economicNews, marketDataText);
      const pcm = await synthesizeSegmentToPCM(result.script);
      await writeSegment(getStockPath(date, stock), pcm, result);
      console.log(`[pre-generate] ${stock} segment saved (${result.script.length} chars)`);
      return stock;
    };
  });

  const stockResults = await runWithConcurrency(stockTasks, 3);
  for (let i = 0; i < stockResults.length; i++) {
    if (stockResults[i].status === "rejected") {
      const reason = (stockResults[i] as PromiseRejectedResult).reason;
      console.error(`[pre-generate] Failed to generate ${allStocks[i]}:`, reason);
      failed.push(allStocks[i]);
    }
  }

  // 6. 클로징 스크립트 생성 + TTS
  console.log(`[pre-generate] Generating closing script...`);
  const closingResult = await generateClosingScript();
  const closingPCM = await synthesizeSegmentToPCM(closingResult.script);
  await writeSegment(getClosingPath(date), closingPCM, closingResult);
  console.log(`[pre-generate] Closing segment saved`);

  // 7. manifest 업데이트
  const generatedStocks = allStocks.filter((s) => !failed.includes(s));
  await writeManifest(date, {
    status: "complete",
    generatedAt: new Date().toISOString(),
    stocks: generatedStocks,
    failed: failed.length > 0 ? failed : undefined,
  });

  // 8. 오래된 데이터 정리
  await cleanOldBriefings(3);

  console.log(`[pre-generate] Done! ${generatedStocks.length} stocks generated, ${failed.length} failed`);

  return { date, stockCount: generatedStocks.length, failed };
}
