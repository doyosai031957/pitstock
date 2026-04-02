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

// 신뢰 언론사 도메인 화이트리스트
const TRUSTED_PUBLISHERS: Record<string, string> = {
  "newsis.com": "뉴시스",
  "sedaily.com": "서울경제",
  "edaily.co.kr": "이데일리",
  "tf.co.kr": "더팩트",
  "yna.co.kr": "연합뉴스",
  "hankookilbo.com": "한국일보",
  "mt.co.kr": "머니투데이",
  "news1.kr": "뉴스1",
  "economist.co.kr": "이코노미스트",
  "fnnews.com": "파이낸셜뉴스",
  "bizwatch.co.kr": "비즈워치",
  "asiae.co.kr": "아시아경제",
};

function isTrustedPublisher(originallink: string): boolean {
  try {
    const hostname = new URL(originallink).hostname.replace(/^www\./, "");
    return Object.keys(TRUSTED_PUBLISHERS).some((domain) => hostname.endsWith(domain));
  } catch {
    return false;
  }
}

// 증권/주식 관련 기사 판별 키워드
const STOCK_FINANCIAL_KEYWORDS = [
  "주가", "주식", "증시", "코스피", "코스닥", "상장", "시가총액",
  "실적", "매출", "영업이익", "순이익", "분기", "반기", "연간",
  "목표주가", "리포트", "투자의견", "컨센서스", "어닝",
  "외국인", "기관", "순매수", "순매도", "수급",
  "배당", "자사주", "유상증자", "무상증자", "감자",
  "인수", "합병", "M&A", "지분", "대주주",
  "공시", "수주", "계약", "납품", "수출",
  "전망", "호재", "악재", "상승", "하락", "급등", "급락",
  "증권", "애널리스트", "리서치", "종목",
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
  // Lab 모드: 현재 시점 기준 24시간 이내
  // 실서비스: 어제 07:00 KST ~ 오늘 07:00 KST (아래 주석 해제)
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const end = now;

  // --- 실서비스용 (Lab에서는 주석 처리) ---
  // const kstOffset = 9 * 60 * 60 * 1000;
  // const kstNow = new Date(now.getTime() + kstOffset);
  // const todayKST = new Date(Date.UTC(
  //   kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(),
  //   7, 0, 0,
  // ) - kstOffset);
  // const start = new Date(todayKST.getTime() - 24 * 60 * 60 * 1000);
  // const end = todayKST;

  return { start, end };
}

function isInBriefingRange(dateStr: string): boolean {
  const articleDate = new Date(dateStr);
  const { start, end } = getBriefingTimeRange();
  return articleDate >= start && articleDate <= end;
}

function isStockRelatedArticle(title: string, description: string): boolean {
  const text = (title + " " + description).toLowerCase();
  return STOCK_FINANCIAL_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()));
}

export async function fetchNewsForStock(stock: string): Promise<StockNews> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID and NAVER_CLIENT_SECRET are required");
  }

  const seenTitles = new Set<string>();
  const allItems: NewsItem[] = [];
  let totalRaw = 0;
  let totalAfterPublisher = 0;
  let totalAfterDate = 0;
  let totalAfterBlacklist = 0;
  let totalAfterStockFilter = 0;

  // 종목명 단일 쿼리, 100건씩 2페이지 = 최대 200건
  for (let startIdx = 1; startIdx <= 101; startIdx += 100) {
    const url = new URL("https://openapi.naver.com/v1/search/news.json");
    url.searchParams.set("query", stock);
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
    const rawItems = data.items || [];
    totalRaw += rawItems.length;

    // 언론사 필터
    const afterPublisher = rawItems.filter((item: { originallink: string }) => isTrustedPublisher(item.originallink));
    totalAfterPublisher += afterPublisher.length;

    const afterDate = afterPublisher.filter((item: { pubDate: string }) => isInBriefingRange(item.pubDate));
    totalAfterDate += afterDate.length;

    const mapped = afterDate.map((item: { title: string; description: string; link: string; originallink: string; pubDate: string }) => ({
      title: stripHtml(item.title),
      description: stripHtml(item.description),
      link: item.link,
      pubDate: item.pubDate,
    }));

    // 블랙리스트 필터
    const afterBlacklist = mapped.filter((item: NewsItem) => !isNonFinancialArticle(item.title, item.description));
    totalAfterBlacklist += afterBlacklist.length;

    // 증권/주식 관련 필터
    const afterStockFilter = afterBlacklist.filter((item: NewsItem) => isStockRelatedArticle(item.title, item.description));
    totalAfterStockFilter += afterStockFilter.length;

    // 중복 제거
    for (const item of afterStockFilter) {
      if (!seenTitles.has(item.title)) {
        seenTitles.add(item.title);
        allItems.push(item);
      }
    }

    // 다음 페이지 필요 없으면 중단
    if (rawItems.length < 100) break;

    // 페이지 간 딜레이
    await new Promise((r) => setTimeout(r, 200));
  }

  // 최신순 정렬 후 상위 15개
  allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  const result = allItems.slice(0, 30);

  console.log(`[news] ${stock}: raw ${totalRaw} → 언론사 ${totalAfterPublisher} → 날짜 ${totalAfterDate} → 블랙리스트 ${totalAfterBlacklist} → 증권 ${totalAfterStockFilter} → 중복제거 ${allItems.length} → 최종 ${result.length}건`);

  return { stock, articles: result };
}

export async function fetchNewsForStocks(stocks: string[]): Promise<StockNews[]> {
  return Promise.all(stocks.map(fetchNewsForStock));
}

const ECONOMIC_KEYWORDS = [
  "뉴욕증시 | 나스닥 | S&P500 마감",
  "미국 빅테크 실적",
  "코스피 | 코스닥",
  "외국인 | 기관",
  "연준 | FOMC | 파월 금리",
  "한국은행",
  "미국 CPI | PCE | 인플레이션",
  "미국 고용 | 실업률 | 비농업",
  "한국 수출 | 무역수지",
  "환율 | 강달러",
  "미국 국채 | 10년물 금리",
  "국제유가 | WTI | 에너지",
  "금값 | 구리가격 | 원자재",
  "미중 갈등 | 지정학적 리스크",
  "경제 | 오늘의 경제",
];

export async function fetchEconomicNews(): Promise<NewsItem[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID and NAVER_CLIENT_SECRET are required");
  }

  const { start, end } = getBriefingTimeRange();
  console.log(`[news] 경제 뉴스 수집 범위: ${start.toISOString()} ~ ${end.toISOString()}`);

  const groupArticles: NewsItem[][] = [];
  const seenTitles = new Set<string>();

  for (let qi = 0; qi < ECONOMIC_KEYWORDS.length; qi++) {
    const query = ECONOMIC_KEYWORDS[qi];
    let allRawItems: { title: string; description: string; link: string; originallink: string; pubDate: string }[] = [];

    // 키워드 간 딜레이 (rate limit 방지)
    if (qi > 0) await new Promise((r) => setTimeout(r, 200));

    // 페이지네이션: 100건씩 최대 2페이지 (어제 기사까지 도달하기 위해)
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

      // 이 페이지에 어제 기사가 있으면 더 이상 페이지네이션 불필요
      const hasYesterdayArticle = pageItems.some((item: { pubDate: string }) => isInBriefingRange(item.pubDate));
      if (hasYesterdayArticle || pageItems.length < 100) break;

      // 페이지 간 딜레이
      await new Promise((r) => setTimeout(r, 200));
    }

    const afterPublisherFilter = allRawItems.filter((item) => isTrustedPublisher(item.originallink));
    const afterDateFilter = afterPublisherFilter.filter((item) => isInBriefingRange(item.pubDate));

    if (afterPublisherFilter.length > 0 && afterDateFilter.length === 0) {
      const dates = afterPublisherFilter.slice(0, 3).map((item) => item.pubDate);
      console.log(`[news] "${query}" → raw ${allRawItems.length} → 언론사 ${afterPublisherFilter.length} → 날짜 0건. 최신: ${dates.join(", ")}`);
    } else {
      console.log(`[news] "${query}" → raw ${allRawItems.length} → 언론사 ${afterPublisherFilter.length} → 날짜 ${afterDateFilter.length}건`);
    }

    const items: NewsItem[] = afterDateFilter
      .map((item) => ({
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

    groupArticles.push(items);
  }

  // 라운드 로빈: 각 키워드 그룹에서 골고루 뽑기 + 내용 유사도 필터
  const result: NewsItem[] = [];
  const usedDescriptions: string[] = [];

  function isSimilar(desc: string): boolean {
    const words = desc.split(/\s+/).filter((w) => w.length >= 2);
    for (const used of usedDescriptions) {
      const usedWords = new Set(used.split(/\s+/).filter((w) => w.length >= 2));
      const overlap = words.filter((w) => usedWords.has(w)).length;
      if (words.length > 0 && overlap / words.length > 0.5) return true;
    }
    return false;
  }

  let round = 0;
  while (result.length < 25) {
    let added = false;
    for (const group of groupArticles) {
      if (round < group.length) {
        const candidate = group[round];
        if (!isSimilar(candidate.description)) {
          result.push(candidate);
          usedDescriptions.push(candidate.description);
          if (result.length >= 25) break;
        }
        added = true;
      }
    }
    if (!added) break;
    round++;
  }

  console.log(`[news] 경제 뉴스 수집 완료: ${result.length}건 (키워드 ${ECONOMIC_KEYWORDS.length}개 검색)`);
  return result;
}
