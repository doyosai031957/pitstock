import { NextRequest } from "next/server";
import { preGenerateBriefing } from "@/lib/pre-generate";

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
