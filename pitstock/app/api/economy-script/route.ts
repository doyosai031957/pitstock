import { getSession } from "@/lib/session";
import { fetchEconomicNews } from "@/lib/naver-news";
import { generateEconomySummary } from "@/lib/generate-script";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  try {
    const economicNews = await fetchEconomicNews();
    const result = await generateEconomySummary(economicNews);

    return Response.json({
      script: result.script,
      glossary: result.glossary,
    });
  } catch (err) {
    console.error("Economy script generation error:", err);
    const message = err instanceof Error ? err.message : "스크립트 생성 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
