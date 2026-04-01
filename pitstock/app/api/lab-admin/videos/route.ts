import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { readdir, readFile, stat } from "fs/promises";
import path from "path";

const VIDEO_DIR = path.join(process.cwd(), "data", "video");

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const dateParam = request.nextUrl.searchParams.get("date");

  // 특정 날짜 영상 스트림
  if (dateParam) {
    const videoPath = path.join(VIDEO_DIR, `${dateParam}.mp4`);
    try {
      const videoBuffer = await readFile(videoPath);
      return new Response(videoBuffer, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `inline; filename="${dateParam}.mp4"`,
        },
      });
    } catch {
      return Response.json({ error: "영상을 찾을 수 없습니다." }, { status: 404 });
    }
  }

  // 전체 목록
  try {
    const files = await readdir(VIDEO_DIR).catch(() => []);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const videos = await Promise.all(
      jsonFiles.map(async (f) => {
        try {
          const content = await readFile(path.join(VIDEO_DIR, f), "utf-8");
          const meta = JSON.parse(content);
          const mp4Path = path.join(VIDEO_DIR, f.replace(".json", ".mp4"));
          const mp4Stat = await stat(mp4Path).catch(() => null);
          return {
            date: meta.date,
            script: meta.script,
            caption: meta.caption ?? "",
            durationSec: meta.durationSec,
            generatedAt: meta.generatedAt,
            fileSizeMB: mp4Stat ? (mp4Stat.size / 1024 / 1024).toFixed(1) : null,
          };
        } catch {
          return null;
        }
      }),
    );

    const sorted = videos.filter(Boolean).sort((a, b) =>
      (b!.date as string).localeCompare(a!.date as string),
    );

    return Response.json({ videos: sorted });
  } catch {
    return Response.json({ videos: [] });
  }
}
