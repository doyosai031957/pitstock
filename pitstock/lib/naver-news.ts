export interface NewsItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
}

export interface StockNews {
  stock: string;
  articles: NewsItem[];
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, " ").trim();
}

// 종목별 금융 맥락 검색 쿼리 (종목명과 조합하여 사용)
const STOCK_QUERY_SUFFIXES = [
  "주가",
  "실적 매출",
  "투자 수주 계약",
  "목표주가 리포트",
  "외국인 기관 매매",
];

// 블랙리스트: 이 키워드가 포함된 기사는 제외
const NON_FINANCIAL_KEYWORDS = [
  "채용", "인턴", "사회공헌", "기부", "봉사", "후원", "장학",
  "나무심기", "나무 심기", "조림", "탄소중립 숲", "친환경 캠페인",
  "전시회", "박람회", "공모전", "체험행사", "페스티벌",
  "신제품 출시", "앱 출시", "업데이트 출시",
  "영업이사", "판매왕", "판매 기록", "누적 판매",
];

function isNonFinancialArticle(title: string, description: string): boolean {
  const text = (title + " " + description).toLowerCase();
  return NON_FINANCIAL_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()));
}

function getBriefingTimeRange(): { start: Date; end: Date } {
  // 전날 00:00:00 KST ~ 전날 23:59:59 KST
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);

  // 오늘 07:00 KST
  const todayKST = new Date(Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate(),
    7, 0, 0,
  ) - kstOffset);

  // 어제 07:00 KST
  const yesterdayKST = new Date(todayKST.getTime() - 24 * 60 * 60 * 1000);

  // 범위: 어제 07:00 KST ~ 오늘 07:00 KST
  const start = yesterdayKST;
  const end = todayKST;

  return { start, end };
}

function isInBriefingRange(dateStr: string): boolean {
  const articleDate = new Date(dateStr);
  const { start, end } = getBriefingTimeRange();
  return articleDate >= start && articleDate <= end;
}

export async function fetchNewsForStock(stock: string): Promise<StockNews> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID and NAVER_CLIENT_SECRET are required");
  }

  // 금융 맥락 쿼리 여러 개로 검색하여 양질의 기사 수집
  const queries = STOCK_QUERY_SUFFIXES.map((suffix) => `${stock} ${suffix}`);
  const seenTitles = new Set<string>();
  const allItems: NewsItem[] = [];

  for (const query of queries) {
    const url = new URL("https://openapi.naver.com/v1/search/news.json");
    url.searchParams.set("query", query);
    url.searchParams.set("display", "100");
    url.searchParams.set("sort", "date");

    const res = await fetch(url.toString(), {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });

    if (!res.ok) continue;

    const data = await res.json();
    const items: NewsItem[] = (data.items || [])
      .filter((item: { pubDate: string }) => isInBriefingRange(item.pubDate))
      .map((item: { title: string; description: string; link: string; pubDate: string }) => ({
        title: stripHtml(item.title),
        description: stripHtml(item.description),
        link: item.link,
        pubDate: item.pubDate,
      }))
      .filter((item: NewsItem) => !isNonFinancialArticle(item.title, item.description))
      .filter((item: NewsItem) => {
        if (seenTitles.has(item.title)) return false;
        seenTitles.add(item.title);
        return true;
      });

    allItems.push(...items);
  }

  // 최신순 정렬 후 상위 15개
  allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  return { stock, articles: allItems.slice(0, 15) };
}

export async function fetchNewsForStocks(stocks: string[]): Promise<StockNews[]> {
  return Promise.all(stocks.map(fetchNewsForStock));
}

const ECONOMIC_KEYWORDS = [
  "뉴욕증시 | 나스닥 | S&P500 마감",
  "미국 빅테크 실적",
  "코스피 | 코스닥 시황",
  "외국인 | 기관 순매수",
  "연준 | FOMC | 파월 금리",
  "한국은행 | 이창용 기준금리",
  "미국 CPI | PCE | 인플레이션",
  "미국 고용 | 실업률 | 비농업",
  "한국 수출 | 무역수지",
  "원달러 환율 | 강달러",
  "미국 국채 | 10년물 금리",
  "국제유가 | WTI | 에너지",
  "금값 | 구리가격 | 원자재",
  "미중 갈등 | 지정학적 리스크",
];

// 네이버 뉴스 키워드 검색 공통 함수
async function fetchNaverNews(
  query: string,
  clientId: string,
  clientSecret: string,
  display: number = 100,
): Promise<{ title: string; description: string; link: string; pubDate: string }[]> {
  const url = new URL("https://openapi.naver.com/v1/search/news.json");
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(display));
  url.searchParams.set("sort", "date");

  const res = await fetch(url.toString(), {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });

  if (!res.ok) return [];
  const data = await res.json();
  return data.items || [];
}

// 공통: 기사 목록을 정제하고 라운드 로빈으로 15건 선별
function selectArticles(groupArticles: NewsItem[][], maxCount: number = 15): NewsItem[] {
  const result: NewsItem[] = [];
  let round = 0;
  while (result.length < maxCount) {
    let added = false;
    for (const group of groupArticles) {
      if (round < group.length) {
        result.push(group[round]);
        added = true;
        if (result.length >= maxCount) break;
      }
    }
    if (!added) break;
    round++;
  }
  return result;
}

/**
 * 수동 생성용 — 날짜 필터 없이 최신 100건씩 수집
 */
export async function fetchEconomicNews(): Promise<NewsItem[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("NAVER_CLIENT_ID and NAVER_CLIENT_SECRET are required");

  console.log("[news] 경제 뉴스 수집 (수동 — 필터 없음)");
  const groupArticles: NewsItem[][] = [];
  const seenTitles = new Set<string>();

  for (let qi = 0; qi < ECONOMIC_KEYWORDS.length; qi++) {
    if (qi > 0) await new Promise((r) => setTimeout(r, 200));

    const rawItems = await fetchNaverNews(ECONOMIC_KEYWORDS[qi], clientId, clientSecret, 100);
    console.log(`[news] "${ECONOMIC_KEYWORDS[qi]}" → ${rawItems.length}건`);

    const items: NewsItem[] = rawItems
      .map((item) => ({
        title: stripHtml(item.title),
        description: stripHtml(item.description),
        link: item.link,
        pubDate: item.pubDate,
      }))
      .filter((item) => !isNonFinancialArticle(item.title, item.description))
      .filter((item) => {
        if (seenTitles.has(item.title)) return false;
        seenTitles.add(item.title);
        return true;
      });

    groupArticles.push(items);
  }

  const result = selectArticles(groupArticles);
  console.log(`[news] 경제 뉴스 수집 완료: ${result.length}건 (키워드 ${ECONOMIC_KEYWORDS.length}개)`);
  return result;
}

/**
 * 스케줄러용 — 어제 07:00 ~ 오늘 07:00 KST 필터 + 페이지네이션
 */
export async function fetchEconomicNewsScheduled(): Promise<NewsItem[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("NAVER_CLIENT_ID and NAVER_CLIENT_SECRET are required");

  const { start, end } = getBriefingTimeRange();
  console.log(`[news] 경제 뉴스 수집 (스케줄러): ${start.toISOString()} ~ ${end.toISOString()}`);

  const groupArticles: NewsItem[][] = [];
  const seenTitles = new Set<string>();

  for (let qi = 0; qi < ECONOMIC_KEYWORDS.length; qi++) {
    const query = ECONOMIC_KEYWORDS[qi];
    let allRawItems: { title: string; description: string; link: string; pubDate: string }[] = [];

    if (qi > 0) await new Promise((r) => setTimeout(r, 200));

    // 페이지네이션: 100건씩 최대 2페이지
    for (let startIdx = 1; startIdx <= 101; startIdx += 100) {
      const url = new URL("https://openapi.naver.com/v1/search/news.json");
      url.searchParams.set("query", query);
      url.searchParams.set("display", "100");
      url.searchParams.set("start", String(startIdx));
      url.searchParams.set("sort", "date");

      const res = await fetch(url.toString(), {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
        },
      });

      if (!res.ok) break;

      const data = await res.json();
      const pageItems = data.items || [];
      allRawItems = allRawItems.concat(pageItems);

      const hasTargetArticle = pageItems.some((item: { pubDate: string }) => isInBriefingRange(item.pubDate));
      if (hasTargetArticle || pageItems.length < 100) break;

      await new Promise((r) => setTimeout(r, 200));
    }

    const afterDateFilter = allRawItems.filter((item) => isInBriefingRange(item.pubDate));

    if (allRawItems.length > 0 && afterDateFilter.length === 0) {
      const dates = allRawItems.slice(0, 3).map((item) => item.pubDate);
      console.log(`[news] "${query}" → ${allRawItems.length}건 중 필터 통과 0건. 최신: ${dates.join(", ")}`);
    } else {
      console.log(`[news] "${query}" → ${allRawItems.length}건 중 필터 통과 ${afterDateFilter.length}건`);
    }

    const items: NewsItem[] = afterDateFilter
      .map((item) => ({
        title: stripHtml(item.title),
        description: stripHtml(item.description),
        link: item.link,
        pubDate: item.pubDate,
      }))
      .filter((item) => !isNonFinancialArticle(item.title, item.description))
      .filter((item) => {
        if (seenTitles.has(item.title)) return false;
        seenTitles.add(item.title);
        return true;
      });

    groupArticles.push(items);
  }

  const result = selectArticles(groupArticles);
  console.log(`[news] 경제 뉴스 수집 완료 (스케줄러): ${result.length}건 (키워드 ${ECONOMIC_KEYWORDS.length}개)`);
  return result;
}
