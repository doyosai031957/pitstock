"use server";

import { USERS } from "./users";
import { createSession, getSession, destroySession } from "./session";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function login(
  id: string,
  password: string,
): Promise<{
  success: boolean;
  error?: string;
  user?: { userId: string; name: string };
}> {
  const user = USERS.find((u) => u.id === id && u.password === password);
  if (!user) {
    return { success: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }
  await createSession(user.id);
  return { success: true, user: { userId: user.id, name: user.name } };
}

export async function logout(): Promise<void> {
  await destroySession();
}

export async function getAuthState(): Promise<{
  userId: string;
  name: string;
} | null> {
  return await getSession();
}

export async function saveStocks(
  stocks: string[],
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "로그인이 필요합니다." };
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, `${session.userId}.json`);
  await fs.writeFile(filePath, JSON.stringify({ stocks }, null, 2), "utf-8");
  return { success: true };
}

export async function loadStocks(): Promise<{ stocks: string[] }> {
  const session = await getSession();
  if (!session) return { stocks: [] };
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, `${session.userId}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    return { stocks: Array.isArray(data.stocks) ? data.stocks : [] };
  } catch {
    return { stocks: [] };
  }
}
