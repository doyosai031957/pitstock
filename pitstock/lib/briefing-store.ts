import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const BRIEFING_DIR = path.join(DATA_DIR, "briefing");

export interface BriefingManifest {
  status: "generating" | "complete";
  generatedAt: string;
  stocks: string[];
  failed?: string[];
}

export interface SegmentMeta {
  script: string;
  glossary: { term: string; definition: string }[];
}

function getDateDir(date: string): string {
  return path.join(BRIEFING_DIR, date);
}

function getStocksDir(date: string): string {
  return path.join(getDateDir(date), "stocks");
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function initBriefingDir(date: string): Promise<void> {
  await ensureDir(getStocksDir(date));
}

// Manifest
export async function writeManifest(date: string, manifest: BriefingManifest): Promise<void> {
  const filePath = path.join(getDateDir(date), "manifest.json");
  await fs.writeFile(filePath, JSON.stringify(manifest, null, 2), "utf-8");
}

export async function readManifest(date: string): Promise<BriefingManifest | null> {
  const filePath = path.join(getDateDir(date), "manifest.json");
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Segment PCM + Meta
export async function writeSegment(basePath: string, pcm: Buffer, meta: SegmentMeta): Promise<void> {
  await fs.writeFile(`${basePath}.pcm`, pcm);
  await fs.writeFile(`${basePath}.json`, JSON.stringify(meta, null, 2), "utf-8");
}

export async function readSegmentPCM(basePath: string): Promise<Buffer> {
  return fs.readFile(`${basePath}.pcm`);
}

export async function readSegmentMeta(basePath: string): Promise<SegmentMeta> {
  const raw = await fs.readFile(`${basePath}.json`, "utf-8");
  return JSON.parse(raw);
}

export function getCommonPath(date: string): string {
  return path.join(getDateDir(date), "common");
}

export function getClosingPath(date: string): string {
  return path.join(getDateDir(date), "closing");
}

export function getStockPath(date: string, stock: string): string {
  return path.join(getStocksDir(date), stock);
}

export async function stockSegmentExists(date: string, stock: string): Promise<boolean> {
  try {
    await fs.access(`${getStockPath(date, stock)}.pcm`);
    return true;
  } catch {
    return false;
  }
}

// 전체 유저의 관심종목 수집 (중복 제거)
export async function getAllUserStocks(): Promise<string[]> {
  await ensureDir(DATA_DIR);
  const files = await fs.readdir(DATA_DIR);
  const stockSet = new Set<string>();

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const filePath = path.join(DATA_DIR, file);
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;
      const raw = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data.stocks)) {
        for (const stock of data.stocks) {
          stockSet.add(stock);
        }
      }
    } catch {
      continue;
    }
  }

  return Array.from(stockSet);
}

// 가장 최근 완료된 브리핑 날짜 찾기
export async function findLatestBriefingDate(): Promise<string | null> {
  try {
    const dirs = await fs.readdir(BRIEFING_DIR);
    // YYYY-MM-DD 형식이라 역순 정렬하면 최신이 먼저
    const sorted = dirs.sort().reverse();
    for (const dir of sorted) {
      const manifest = await readManifest(dir);
      if (manifest && manifest.status === "complete") {
        return dir;
      }
    }
  } catch {
    // briefing dir doesn't exist yet
  }
  return null;
}

// 오래된 브리핑 폴더 정리
export async function cleanOldBriefings(keepDays: number = 3): Promise<void> {
  try {
    const dirs = await fs.readdir(BRIEFING_DIR);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - keepDays);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    for (const dir of dirs) {
      if (dir < cutoffStr) {
        await fs.rm(path.join(BRIEFING_DIR, dir), { recursive: true, force: true });
      }
    }
  } catch {
    // briefing dir doesn't exist yet
  }
}
