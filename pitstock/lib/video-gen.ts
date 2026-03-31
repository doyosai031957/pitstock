import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink, mkdir, access } from "fs/promises";
import path from "path";
import os from "os";
import { SAMPLE_RATE } from "./tts";

const execFileAsync = promisify(execFile);

const FFMPEG_PATH = process.env.FFMPEG_PATH
  || "C:\\Users\\User\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1-full_build\\bin\\ffmpeg.exe";

const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;

// 고정 배경 이미지 경로 (public/video-bg.png에 넣으면 사용)
const BG_IMAGE_PATH = path.join(process.cwd(), "public", "video-bg.png");

// ====== 자막 타이밍 ======

export interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}

export function generateSubtitleSegmentsFallback(script: string, audioDurationSec: number): SubtitleSegment[] {
  const sentences = script
    .split(/(?<=[^0-9][.?!。]|[,])\s*/)
    .filter((s) => s.trim().length > 0);

  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
  const segments: SubtitleSegment[] = [];
  let currentTime = 0;

  for (const sentence of sentences) {
    const ratio = sentence.length / totalChars;
    const duration = ratio * audioDurationSec;
    segments.push({ start: currentTime, end: currentTime + duration, text: sentence.trim() });
    currentTime += duration;
  }

  return segments;
}

// ====== ASS 자막 생성 ======

function generateASS(segments: SubtitleSegment[]): string {
  const header = `[Script Info]
Title: PitStock Briefing
ScriptType: v4.00+
PlayResX: ${VIDEO_WIDTH}
PlayResY: ${VIDEO_HEIGHT}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Malgun Gothic,58,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,1,0,1,2,1,2,80,80,280,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events = segments.map((seg) => {
    const start = formatASSTime(seg.start);
    const end = formatASSTime(seg.end);
    const text = wrapSubtitleText(seg.text, 16);
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
  });

  return header + "\n" + events.join("\n");
}

function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

/**
 * 한국어 단어 경계 기반 자막 줄바꿈
 */
function wrapSubtitleText(text: string, maxChars: number = 16): string {
  if (text.length <= maxChars) return text;

  const lines: string[] = [];
  let remaining = text.trim();

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      lines.push(remaining);
      break;
    }

    let breakIdx = -1;
    const searchEnd = Math.min(remaining.length - 1, maxChars + 3);
    const searchStart = Math.max(0, maxChars - 5);

    // 1순위: 구두점 뒤에서 끊기
    for (let i = searchEnd; i >= searchStart; i--) {
      if (/[,，.。!?;]/.test(remaining[i]) && i + 1 < remaining.length) {
        breakIdx = i + 1;
        break;
      }
    }

    // 2순위: 띄어쓰기(단어 경계)에서 끊기
    if (breakIdx === -1) {
      for (let i = searchEnd; i >= searchStart; i--) {
        if (remaining[i] === " ") {
          breakIdx = i;
          break;
        }
      }
    }

    // 3순위: 글자수로 강제 끊기
    if (breakIdx === -1 || breakIdx <= 0) {
      breakIdx = maxChars;
    }

    lines.push(remaining.substring(0, breakIdx).trim());
    remaining = remaining.substring(breakIdx).trim();
  }

  return lines.join("\\N");
}

// ====== 유틸 ======

export function pcmDurationSec(pcmBuffer: Buffer): number {
  return pcmBuffer.length / (SAMPLE_RATE * 2 * 1);
}

function addWavHeader(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  const dataSize = pcm.length;
  const byteRate = SAMPLE_RATE * 1 * 2;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ====== 메인 영상 생성 ======

export interface VideoGenResult {
  videoBase64: string;
  durationSec: number;
  hasBgImage: boolean;
}

export async function generateVideo(
  pcmAudio: Buffer,
  script: string,
  title?: string,
): Promise<VideoGenResult> {
  const tmpDir = path.join(os.tmpdir(), "pitstock-video-" + Date.now());
  await mkdir(tmpDir, { recursive: true });

  const wavPath = path.join(tmpDir, "audio.wav");
  const assPath = path.join(tmpDir, "subtitles.ass");
  const outputPath = path.join(tmpDir, "output.mp4");

  try {
    // 1. WAV 저장
    const wavBuffer = addWavHeader(pcmAudio);
    await writeFile(wavPath, wavBuffer);
    const duration = pcmDurationSec(pcmAudio);

    // 2. 자막 생성 (원본 스크립트 + 글자수 비율 타이밍)
    // TTS는 속도가 일정하므로 글자수 비율이 Whisper보다 정확
    const segments = generateSubtitleSegmentsFallback(script, duration);
    console.log(`[video] 자막 생성: ${segments.length}개 세그먼트`);

    await writeFile(assPath, generateASS(segments), "utf-8");

    // 3. 배경 이미지 확인 (public/video-bg.png)
    const hasBgImage = await fileExists(BG_IMAGE_PATH);
    console.log(`[video] 배경: ${hasBgImage ? "고정 이미지" : "단색 배경"}`);

    // 4. FFmpeg 합성
    const titleText = (title || "PitStock 경제 브리핑").replace(/'/g, "\u2019");
    // 오늘 날짜 표시
    const dateStr = new Date().toLocaleDateString("ko-KR", {
      year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul",
    });
    const assEscaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    const fontBold = "C\\:/Windows/Fonts/malgunbd.ttf";
    const fontRegular = "C\\:/Windows/Fonts/malgun.ttf";

    const vf = [
      `drawtext=text='${titleText}':fontfile='${fontBold}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=180`,
      `drawtext=text='${dateStr}':fontfile='${fontRegular}':fontsize=32:fontcolor=0xAAAAAA:x=(w-text_w)/2:y=250`,
      `ass='${assEscaped}'`,
    ].join(",");

    let ffmpegArgs: string[];

    if (hasBgImage) {
      // 전체 배경 이미지 사용 (1080x1920)
      ffmpegArgs = [
        "-y",
        "-loop", "1",
        "-i", BG_IMAGE_PATH,
        "-i", wavPath,
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-pix_fmt", "yuv420p",
        "-shortest",
        "-t", duration.toFixed(2),
        outputPath,
      ];
    } else {
      ffmpegArgs = [
        "-y",
        "-f", "lavfi",
        "-i", `color=c=0x0a0a14:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=${duration.toFixed(2)}:r=30`,
        "-i", wavPath,
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-pix_fmt", "yuv420p",
        "-shortest",
        outputPath,
      ];
    }

    console.log("[video] FFmpeg 영상 합성 중...");
    await execFileAsync(FFMPEG_PATH, ffmpegArgs, { timeout: 180000, maxBuffer: 10 * 1024 * 1024 });

    // 5. 결과
    const videoBuffer = await readFile(outputPath);
    return {
      videoBase64: videoBuffer.toString("base64"),
      durationSec: duration,
      hasBgImage,
    };
  } finally {
    await Promise.all([wavPath, assPath, outputPath].map((f) => unlink(f).catch(() => {})));
  }
}
