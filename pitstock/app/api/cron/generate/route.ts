import { NextRequest } from "next/server";
import { preGenerateBriefing } from "@/lib/pre-generate";

/**
 * [브리핑 사전 생성 크론 API]
 *
 * 실서비스 배포 시 아래 스케줄로 이 엔드포인트를 호출해야 합니다:
 *
 * 1차 생성: 매일 07:00 KST
 *   - 전체 유저 관심종목을 수집하여 뉴스 + KIS 시장 데이터 기반 스크립트 생성
 *   - 종목별 TTS(PCM) 사전 생성 후 data/briefing/{날짜}/에 캐시
 *
 * 2차 갱신: 매일 07:30 KST
 *   - 동일 엔드포인트 재호출 → 07:00~07:30 사이 새 뉴스 반영하여 덮어쓰기
 *
 * 이후 다음날 07:00까지 새로 생성하지 않음 (캐시 재사용)
 *   - 유저가 브리핑 요청 시 POST /api/briefing에서 캐시된 PCM을 조립하여 반환
 *   - 캐시에 없는 종목만 온디맨드 생성 (generateStockOnDemand)
 *
 * 호출 방법 예시:
 *   - Vercel Cron: vercel.json의 crons 설정
 *   - 외부 스케줄러: GET /api/cron/generate (Authorization: Bearer {CRON_SECRET})
 *   - 로컬 테스트: curl http://localhost:3000/api/cron/generate
 *
 * 캐시 보관: 최근 3일치만 유지, 이전 데이터 자동 삭제
 */
export async function GET(request: NextRequest) {
  // CRON_SECRET 인증
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await preGenerateBriefing();
    return Response.json({
      success: true,
      date: result.date,
      stockCount: result.stockCount,
      failed: result.failed,
    });
  } catch (err) {
    console.error("[cron/generate] Error:", err);
    const message = err instanceof Error ? err.message : "사전 생성 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
