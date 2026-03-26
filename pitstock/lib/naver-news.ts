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
  url.searchParams.set("sort", "date");

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
    }));

  return { stock, articles: items };
}

export async function fetchNewsForStocks(stocks: string[]): Promise<StockNews[]> {
  return Promise.all(stocks.map(fetchNewsForStock));
}

const ECONOMIC_KEYWORDS = [
  "코스피 코스닥 증시",
  "환율 달러 원화",
  "금리 기준금리 한국은행",
  "유가 원유 국제유가",
  "미국 증시 나스닥 다우",
];

export async function fetchEconomicNews(): Promise<NewsItem[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID and NAVER_CLIENT_SECRET are required");
  }

  const allArticles: NewsItem[] = [];
  const seenTitles = new Set<string>();

  for (const query of ECONOMIC_KEYWORDS) {
    const url = new URL("https://openapi.naver.com/v1/search/news.json");
    url.searchParams.set("query", query);
    url.searchParams.set("display", "10");
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
      }));

    for (const item of items) {
      if (!seenTitles.has(item.title)) {
        seenTitles.add(item.title);
        allArticles.push(item);
      }
    }
  }

  return allArticles.slice(0, 15);
}
