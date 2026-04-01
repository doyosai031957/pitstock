import { getSession } from "@/lib/session";
import { readdir, readFile } from "fs/promises";
import path from "path";

const BRIEFING_DIR = path.join(process.cwd(), "data", "briefing");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const dateDirs = await readdir(BRIEFING_DIR).catch(() => []);

    const briefings = await Promise.all(
      dateDirs.map(async (dateDir) => {
        try {
          const manifestPath = path.join(BRIEFING_DIR, dateDir, "manifest.json");
          const content = await readFile(manifestPath, "utf-8");
          const manifest = JSON.parse(content);

          // 공통 스크립트 읽기
          let commonScript = "";
          try {
            const commonMeta = await readFile(
              path.join(BRIEFING_DIR, dateDir, "common.json"),
              "utf-8",
            );
            commonScript = JSON.parse(commonMeta).script ?? "";
          } catch { /* no common script */ }

          return {
            date: dateDir,
            status: manifest.status,
            generatedAt: manifest.generatedAt,
            stocks: manifest.stocks ?? [],
            failed: manifest.failed ?? [],
            commonScript,
          };
        } catch {
          return null;
        }
      }),
    );

    const sorted = briefings.filter(Boolean).sort((a, b) =>
      (b!.date as string).localeCompare(a!.date as string),
    );

    return Response.json({ briefings: sorted });
  } catch {
    return Response.json({ briefings: [] });
  }
}
