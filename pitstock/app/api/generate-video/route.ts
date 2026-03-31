import { getSession } from "@/lib/session";
import { fetchEconomicNews } from "@/lib/naver-news";
import { generateEconomySummary } from "@/lib/generate-script";
import { synthesizeSegmentToPCMClova } from "@/lib/tts";
import { generateVideo } from "@/lib/video-gen";
import { fetchMarketOverview, formatIndicesForPrompt } from "@/lib/kis-api";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    console.log("[video] 1/5 경제 뉴스 + 시장 데이터 수집...");
    const [economicNews, marketOverview] = await Promise.all([
      fetchEconomicNews(),
      fetchMarketOverview().catch((err) => {
        console.warn("[video] KIS API 시장 데이터 조회 실패 (뉴스만으로 진행):", err);
        return null;
      }),
    ]);

    const marketDataText = marketOverview
      ? formatIndicesForPrompt(marketOverview)
      : undefined;

    if (marketOverview) {
      console.log(`[video] 시장 데이터: 지수 ${marketOverview.indices.length}개 (종목 데이터 제외)`);
    }

    console.log("[video] 2/5 스크립트 생성...");
    const scriptResult = await generateEconomySummary(economicNews, marketDataText);

    console.log("[video] 3/5 TTS 음성 생성...");
    const pcmAudio = await synthesizeSegmentToPCMClova(scriptResult.script);

    console.log("[video] 4/5 FFmpeg 영상 합성...");
    const { videoBase64, durationSec, hasBgImage } = await generateVideo(
      pcmAudio,
      scriptResult.script,
    );

    console.log(`[video] 완료! ${durationSec.toFixed(1)}초 | 배경: ${hasBgImage ? "이미지" : "단색"}`);

    return Response.json({
      videoBase64,
      script: scriptResult.script,
      caption: scriptResult.caption ?? "",
      durationSec,
      hasBgImage,
    });
  } catch (err) {
    console.error("[video] Error:", err);
    const message = err instanceof Error ? err.message : "영상 생성 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
