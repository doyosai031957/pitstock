// 한국투자증권 OpenAPI 클라이언트
// 토큰 관리 + 주식 시세/투자자 동향 조회

const KIS_BASE_URL = "https://openapi.koreainvestment.com:9443";

// 토큰 캐시 (서버 메모리, 재시작 시 재발급)
let cachedToken: { token: string; expiresAt: number } | null = null;

function getKISConfig() {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new Error("KIS_APP_KEY and KIS_APP_SECRET are required");
  }
  return { appKey, appSecret };
}

// OAuth 토큰 발급
async function getAccessToken(): Promise<string> {
  // 캐시된 토큰이 유효하면 재사용
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const { appKey, appSecret } = getKISConfig();

  const response = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: appKey,
      appsecret: appSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`KIS token request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const token = data.access_token;
  // 토큰 유효기간: 보통 24시간, 안전하게 23시간으로 캐시
  cachedToken = {
    token,
    expiresAt: Date.now() + 23 * 60 * 60 * 1000,
  };

  console.log("[kis-api] Access token issued");
  return token;
}

// 공통 API 호출 헬퍼
async function kisRequest(
  path: string,
  trId: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const { appKey, appSecret } = getKISConfig();
  const token = await getAccessToken();

  const url = new URL(`${KIS_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: trId,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`KIS API error (${trId}): ${response.status} ${errorText}`);
  }

  return response.json();
}

// === 주식현재가 시세 ===
export interface StockPrice {
  stockCode: string;
  stockName: string;
  currentPrice: number;       // 현재가
  changePrice: number;        // 전일 대비
  changeRate: number;         // 등락률 (%)
  volume: number;             // 거래량
  high52w: number;            // 52주 최고가
  low52w: number;             // 52주 최저가
  marketCap: number;          // 시가총액 (억원)
}

export async function fetchStockPrice(stockCode: string): Promise<StockPrice> {
  const data = await kisRequest(
    "/uapi/domestic-stock/v1/quotations/inquire-price",
    "FHKST01010100",
    {
      FID_COND_MRKT_DIV_CODE: "J",  // 주식
      FID_INPUT_ISCD: stockCode,
    },
  );

  const output = data.output as Record<string, string>;

  return {
    stockCode,
    stockName: output.hts_kor_isnm || "",
    currentPrice: parseInt(output.stck_prpr) || 0,
    changePrice: parseInt(output.prdy_vrss) || 0,
    changeRate: parseFloat(output.prdy_ctrt) || 0,
    volume: parseInt(output.acml_vol) || 0,
    high52w: parseInt(output.stck_hgpr) || 0,
    low52w: parseInt(output.stck_lwpr) || 0,
    marketCap: Math.round((parseInt(output.hts_avls) || 0)),
  };
}

// === 종목별 투자자 매매동향 (일별) ===
export interface InvestorData {
  stockCode: string;
  foreignNetBuy: number;      // 외국인 순매수 (주)
  institutionNetBuy: number;  // 기관 순매수 (주)
  individualNetBuy: number;   // 개인 순매수 (주)
}

export async function fetchInvestorData(stockCode: string): Promise<InvestorData> {
  const data = await kisRequest(
    "/uapi/domestic-stock/v1/quotations/inquire-investor",
    "FHKST01010900",
    {
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: stockCode,
    },
  );

  // output은 배열, 첫 번째가 가장 최근 날짜
  const outputArray = data.output as Record<string, string>[];
  const latest = outputArray?.[0];

  if (!latest) {
    return {
      stockCode,
      foreignNetBuy: 0,
      institutionNetBuy: 0,
      individualNetBuy: 0,
    };
  }

  return {
    stockCode,
    foreignNetBuy: parseInt(latest.frgn_ntby_qty) || 0,
    institutionNetBuy: parseInt(latest.orgn_ntby_qty) || 0,
    individualNetBuy: parseInt(latest.prsn_ntby_qty) || 0,
  };
}

// === 종목 데이터 통합 조회 ===
export interface StockMarketData {
  price: StockPrice;
  investor: InvestorData;
}

export async function fetchStockMarketData(stockCode: string): Promise<StockMarketData> {
  const [price, investor] = await Promise.all([
    fetchStockPrice(stockCode),
    fetchInvestorData(stockCode),
  ]);
  return { price, investor };
}

// 여러 종목 조회 (rate limit 방지: 순차 처리 + 딜레이)
export async function fetchMultipleStockData(
  stockCodes: string[],
): Promise<Map<string, StockMarketData>> {
  const results = new Map<string, StockMarketData>();

  for (const code of stockCodes) {
    try {
      const data = await fetchStockMarketData(code);
      results.set(code, data);
      // KIS API rate limit: 초당 20건, 안전하게 100ms 간격
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (err) {
      console.error(`[kis-api] Failed to fetch ${code}:`, err);
    }
  }

  return results;
}

// === 업종(지수) 현재가 시세 ===
export interface IndexPrice {
  indexCode: string;
  indexName: string;
  currentValue: number;       // 현재 지수
  changeValue: number;        // 전일 대비
  changeRate: number;         // 등락률 (%)
  volume: number;             // 거래량 (만주)
}

export async function fetchIndexPrice(indexCode: string): Promise<IndexPrice> {
  const data = await kisRequest(
    "/uapi/domestic-stock/v1/quotations/inquire-index-price",
    "FHPUP02100000",
    {
      FID_COND_MRKT_DIV_CODE: "U",  // 업종
      FID_INPUT_ISCD: indexCode,
    },
  );

  const output = data.output as Record<string, string>;

  return {
    indexCode,
    indexName: output.hts_kor_isnm || indexCode,
    currentValue: parseFloat(output.bstp_nmix_prpr) || 0,
    changeValue: parseFloat(output.bstp_nmix_prdy_vrss) || 0,
    changeRate: parseFloat(output.bstp_nmix_prdy_ctrt) || 0,
    volume: parseInt(output.acml_vol) || 0,
  };
}

// === 영상 스크립트용 시장 개요 데이터 ===
export interface MarketOverview {
  indices: IndexPrice[];
  topStocks: StockMarketData[];
}

// 영상 스크립트에 포함할 주요 대형주 (섹터 대표)
const VIDEO_SCRIPT_STOCKS: { name: string; code: string }[] = [
  { name: "삼성전자", code: "005930" },
  { name: "SK하이닉스", code: "000660" },
  { name: "현대차", code: "005380" },
  { name: "NAVER", code: "035420" },
  { name: "한화에어로스페이스", code: "012450" },
];

export async function fetchMarketOverview(): Promise<MarketOverview> {
  // 1. 코스피 + 코스닥 지수
  const [kospi, kosdaq] = await Promise.all([
    fetchIndexPrice("0001").catch(() => null),
    fetchIndexPrice("1001").catch(() => null),
  ]);
  const indices = [kospi, kosdaq].filter((v): v is IndexPrice => v !== null);

  // 2. 주요 대형주 시세 (순차, rate limit 방지)
  const topStocks: StockMarketData[] = [];
  for (const stock of VIDEO_SCRIPT_STOCKS) {
    try {
      const data = await fetchStockMarketData(stock.code);
      topStocks.push(data);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (err) {
      console.error(`[kis-api] Failed to fetch ${stock.name}:`, err);
    }
  }

  return { indices, topStocks };
}

export function formatMarketOverviewForPrompt(overview: MarketOverview): string {
  let text = "[시장 데이터 — 한국투자증권 API 실시간 조회]\n\n";

  // 지수
  for (const idx of overview.indices) {
    const sign = idx.changeValue >= 0 ? "+" : "";
    text += `${idx.indexName}: ${idx.currentValue.toFixed(2)}포인트 (${sign}${idx.changeRate}퍼센트, ${sign}${idx.changeValue.toFixed(2)})\n`;
  }
  text += "\n";

  // 주요 종목
  text += "[주요 종목 시세]\n";
  for (const stock of overview.topStocks) {
    const { price, investor } = stock;
    const sign = price.changePrice >= 0 ? "+" : "";
    text += `${price.stockName}: ${price.currentPrice.toLocaleString()}원 (${sign}${price.changeRate}퍼센트)`;

    const parts: string[] = [];
    if (investor.foreignNetBuy !== 0) {
      parts.push(`외국인 ${investor.foreignNetBuy >= 0 ? "순매수" : "순매도"} ${Math.abs(investor.foreignNetBuy).toLocaleString()}주`);
    }
    if (investor.institutionNetBuy !== 0) {
      parts.push(`기관 ${investor.institutionNetBuy >= 0 ? "순매수" : "순매도"} ${Math.abs(investor.institutionNetBuy).toLocaleString()}주`);
    }
    if (parts.length > 0) {
      text += ` | ${parts.join(", ")}`;
    }
    text += "\n";
  }

  return text;
}

/** 영상용: 지수 + 주요 종목 수급 요약 (종목별 분석 아님) */
export function formatIndicesForPrompt(overview: MarketOverview): string {
  let text = "[시장 데이터 — 한국투자증권 API 실시간 조회]\n\n";

  for (const idx of overview.indices) {
    const sign = idx.changeValue >= 0 ? "+" : "";
    text += `${idx.indexName}: ${idx.currentValue.toFixed(2)}포인트 (${sign}${idx.changeRate}퍼센트, ${sign}${idx.changeValue.toFixed(2)})\n`;
  }

  // 주요 종목 수급 요약 (개별 종목 분석용이 아니라 시장 전체 외국인/기관 흐름 파악용)
  if (overview.topStocks.length > 0) {
    text += "\n[주요 대형주 외국인/기관 수급 동향 — 시장 전체 흐름 파악용]\n";
    for (const stock of overview.topStocks) {
      const { price, investor } = stock;
      const parts: string[] = [];
      if (investor.foreignNetBuy !== 0) {
        parts.push(`외국인 ${investor.foreignNetBuy >= 0 ? "순매수" : "순매도"} ${Math.abs(investor.foreignNetBuy).toLocaleString()}주`);
      }
      if (investor.institutionNetBuy !== 0) {
        parts.push(`기관 ${investor.institutionNetBuy >= 0 ? "순매수" : "순매도"} ${Math.abs(investor.institutionNetBuy).toLocaleString()}주`);
      }
      if (parts.length > 0) {
        text += `${price.stockName}: ${parts.join(", ")}\n`;
      }
    }
    text += "※ 위 데이터는 개별 종목 분석이 아니라 외국인/기관의 전반적 매매 흐름을 보여주기 위한 참고 자료입니다.\n";
  }

  return text;
}

// 스크립트 생성용 포맷 (개별 종목)
export function formatMarketDataForPrompt(data: StockMarketData): string {
  const { price, investor } = data;
  const changeSign = price.changePrice >= 0 ? "+" : "";

  let text = `[시장 데이터]\n`;
  text += `전일 종가: ${price.currentPrice.toLocaleString()}원 (${changeSign}${price.changeRate}퍼센트)\n`;
  text += `거래량: ${(price.volume / 10000).toFixed(0)}만주\n`;

  if (investor.foreignNetBuy !== 0) {
    const foreignSign = investor.foreignNetBuy >= 0 ? "순매수" : "순매도";
    text += `외국인: ${foreignSign} ${Math.abs(investor.foreignNetBuy).toLocaleString()}주\n`;
  }
  if (investor.institutionNetBuy !== 0) {
    const instSign = investor.institutionNetBuy >= 0 ? "순매수" : "순매도";
    text += `기관: ${instSign} ${Math.abs(investor.institutionNetBuy).toLocaleString()}주\n`;
  }

  text += `52주 최고: ${price.high52w.toLocaleString()}원 / 최저: ${price.low52w.toLocaleString()}원\n`;

  return text;
}
