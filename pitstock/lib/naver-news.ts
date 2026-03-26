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

const NON_FINANCIAL_KEYWORDS = [
  "출시", "론칭", "신제품", "세탁기", "건조기", "냉장고", "에어컨", "TV",
  "갤럭시", "아이폰", "스마트폰", "태블릿", "노트북",
  "채용", "인턴", "사회공헌", "기부", "봉사", "후원",
  "마케팅", "캠페인", "프로모션", "할인", "이벤트",
  "브라우저", "앱 출시", "업데이트 출시", "세탁건조기",
];

function isNonFinancialArticle(title: string): boolean {
  const lower = title.toLowerCase();
  return NON_FINANCIAL_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function getKSTDate(): Date {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  return new Date(now.getTime() + kstOffset + now.getTimezoneOffset() * 60 * 1000);
}

function getBriefingTimeRange(): { start: Date; end: Date; type: string } {
  const kst = getKSTDate();
  const hour = kst.getHours();

  if (hour < 17) {
    // 아침 브리핑: 전날 18시 ~ 당일 07시
    const start = new Date(kst);
    start.setDate(start.getDate() - 1);
    start.setHours(18, 0, 0, 0);
    const end = new Date(kst);
    end.setHours(7, 0, 0, 0);
    return { start, end, type: "아침" };
  } else {
    // 저녁 브리핑: 당일 08시 ~ 18시
    const start = new Date(kst);
    start.setHours(8, 0, 0, 0);
    const end = new Date(kst);
    end.setHours(18, 0, 0, 0);
    return { start, end, type: "저녁" };
  }
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

  const url = new URL("https://openapi.naver.com/v1/search/news.json");
  url.searchParams.set("query", stock);
  url.searchParams.set("display", "30");
  url.searchParams.set("sort", "sim");

  const res = await fetch(url.toString(), {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });

  if (!res.ok) {
    throw new Error(`Naver API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const items: NewsItem[] = (data.items || [])
    .filter((item: { pubDate: string }) => isInBriefingRange(item.pubDate))
    .map((item: { title: string; description: string; link: string; pubDate: string }) => ({
      title: stripHtml(item.title),
      description: stripHtml(item.description),
      link: item.link,
      pubDate: item.pubDate,
    }))
    .filter((item: NewsItem) => !isNonFinancialArticle(item.title));

  return { stock, articles: items };
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

export async function fetchEconomicNews(): Promise<NewsItem[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID and NAVER_CLIENT_SECRET are required");
  }

  const groupArticles: NewsItem[][] = [];
  const seenTitles = new Set<string>();

  for (const query of ECONOMIC_KEYWORDS) {
    const url = new URL("https://openapi.naver.com/v1/search/news.json");
    url.searchParams.set("query", query);
    url.searchParams.set("display", "3");
    url.searchParams.set("sort", "date");

    const res = await fetch(url.toString(), {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });

    if (!res.ok) {
      groupArticles.push([]);
      continue;
    }

    const data = await res.json();
    const items: NewsItem[] = (data.items || [])
      .filter((item: { pubDate: string }) => isInBriefingRange(item.pubDate))
      .map((item: { title: string; description: string; link: string; pubDate: string }) => ({
        title: stripHtml(item.title),
        description: stripHtml(item.description),
        link: item.link,
        pubDate: item.pubDate,
      }))
      .filter((item: NewsItem) => !isNonFinancialArticle(item.title))
      .filter((item: NewsItem) => {
        if (seenTitles.has(item.title)) return false;
        seenTitles.add(item.title);
        return true;
      });

    groupArticles.push(items);
  }

  // 라운드 로빈: 각 키워드 그룹에서 골고루 뽑기
  const result: NewsItem[] = [];
  let round = 0;
  while (result.length < 15) {
    let added = false;
    for (const group of groupArticles) {
      if (round < group.length) {
        result.push(group[round]);
        added = true;
        if (result.length >= 15) break;
      }
    }
    if (!added) break;
    round++;
  }

  return result;
}
