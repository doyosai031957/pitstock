import { cookies } from "next/headers";
import crypto from "crypto";
import { USERS } from "./users";

const SECRET = process.env.SESSION_SECRET || "pitstock-dev-secret-key";
const COOKIE_NAME = "pitstock-session";

function sign(value: string): string {
  const sig = crypto.createHmac("sha256", SECRET).update(value).digest("hex");
  return `${value}.${sig}`;
}

function verify(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(value)
    .digest("hex");
  if (sig !== expected) return null;
  return value;
}

export async function createSession(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, sign(userId), {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession(): Promise<{
  userId: string;
  name: string;
} | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie) return null;
  const userId = verify(cookie.value);
  if (!userId) return null;
  const user = USERS.find((u) => u.id === userId);
  if (!user) return null;
  return { userId: user.id, name: user.name };
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
