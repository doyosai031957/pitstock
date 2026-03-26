import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { fetchNewsForStocks, fetchEconomicNews } from "@/lib/naver-news";
import { generateScript } from "@/lib/generate-script";
import { synthesizeSpeech } from "@/lib/tts";

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
    // 3. 네이버 뉴스 수집 (종목별 + 경제 일반)
    const [newsData, economicNews] = await Promise.all([
      fetchNewsForStocks(stocks),
      fetchEconomicNews(),
    ]);

    // 4. Claude API로 스크립트 생성
    const { script, glossary } = await generateScript(newsData, economicNews);

    // 5. Google TTS로 음성 변환
    const audioBase64 = await synthesizeSpeech(script);

    return Response.json({ script, audioBase64, glossary });
  } catch (err) {
    console.error("Briefing generation error:", err);
    const message = err instanceof Error ? err.message : "브리핑 생성 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
