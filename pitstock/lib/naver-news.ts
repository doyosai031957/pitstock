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

function isYesterday(dateStr: string): boolean {
  const articleDate = new Date(dateStr);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return (
    articleDate.getFullYear() === yesterday.getFullYear() &&
    articleDate.getMonth() === yesterday.getMonth() &&
    articleDate.getDate() === yesterday.getDate()
  );
}

export async function fetchNewsForStock(stock: string): Promise<StockNews> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID and NAVER_CLIENT_SECRET are required");
  }

  const url = new URL("https://openapi.naver.com/v1/search/news.json");
  url.searchParams.set("query", stock);
  url.searchParams.set("display", "20");
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
    .filter((item: { pubDate: string }) => isYesterday(item.pubDate))
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
