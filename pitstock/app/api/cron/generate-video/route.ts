import { NextRequest } from "next/server";
import { fetchEconomicNews } from "@/lib/naver-news";
import { generateEconomySummary } from "@/lib/generate-script";
import { synthesizeSegmentToPCMClova } from "@/lib/tts";
import { generateVideo } from "@/lib/video-gen";
import { fetchMarketOverview, formatIndicesForPrompt } from "@/lib/kis-api";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

/**
 * [영상 브리핑 자동 생성 크론 API]
 *
 * 실서버: 매일 07:00 KST 자동 호출
 *   - 어제 07:00 ~ 오늘 07:00 KST 뉴스 수집
 *   - 스크립트 생성 → TTS → 영상 합성 → 파일 저장
 *
 * 테스트: 수동 호출 (인스타 페이지 버튼 또는 직접 호출)
 *
 * 호출 방법:
 *   - 외부 스케줄러: GET /api/cron/generate-video (Authorization: Bearer {CRON_SECRET})
 *   - 로컬 테스트: curl http://localhost:3000/api/cron/generate-video
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[cron-video] 영상 브리핑 자동 생성 시작");

    // 1. 경제 뉴스 + 시장 데이터 수집
    console.log("[cron-video] 1/4 경제 뉴스 + 시장 데이터 수집...");
    const [economicNews, marketOverview] = await Promise.all([
      fetchEconomicNews(),
      fetchMarketOverview().catch((err) => {
        console.warn("[cron-video] KIS API 시장 데이터 조회 실패:", err);
        return null;
      }),
    ]);

    const marketDataText = marketOverview
      ? formatIndicesForPrompt(marketOverview)
      : undefined;

    console.log(`[cron-video] 뉴스 ${economicNews.length}건, 지수 ${marketOverview?.indices.length ?? 0}개`);

    // 2. 스크립트 생성
    console.log("[cron-video] 2/4 스크립트 생성...");
    const scriptResult = await generateEconomySummary(economicNews, marketDataText);
    console.log(`[cron-video] 스크립트 ${scriptResult.script.length}자`);

    // 3. TTS 음성 생성
    console.log("[cron-video] 3/4 TTS 음성 생성...");
    const pcmAudio = await synthesizeSegmentToPCMClova(scriptResult.script);

    // 4. FFmpeg 영상 합성
    console.log("[cron-video] 4/4 FFmpeg 영상 합성...");
    const { videoBase64, durationSec, hasBgImage } = await generateVideo(
      pcmAudio,
      scriptResult.script,
    );

    // 5. 파일 저장
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kst = new Date(now.getTime() + kstOffset);
    const dateStr = kst.toISOString().split("T")[0];

    const videoDir = path.join(process.cwd(), "data", "video");
    await mkdir(videoDir, { recursive: true });

    const videoPath = path.join(videoDir, `${dateStr}.mp4`);
    const metaPath = path.join(videoDir, `${dateStr}.json`);

    await writeFile(videoPath, Buffer.from(videoBase64, "base64"));
    await writeFile(metaPath, JSON.stringify({
      date: dateStr,
      script: scriptResult.script,
      caption: scriptResult.caption ?? "",
      glossary: scriptResult.glossary,
      durationSec,
      hasBgImage,
      generatedAt: new Date().toISOString(),
    }, null, 2));

    console.log(`[cron-video] 완료! ${dateStr}.mp4 (${durationSec.toFixed(1)}초)`);

    return Response.json({
      success: true,
      date: dateStr,
      durationSec,
      scriptLength: scriptResult.script.length,
    });
  } catch (err) {
    console.error("[cron-video] Error:", err);
    const message = err instanceof Error ? err.message : "영상 생성 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
