// PRD 8.1: web sessions for families and donors. Cookie value = "<session uuid>.<HMAC-SHA256 of it>",
// httpOnly, 30 days. The row in web_sessions is the source of truth; the HMAC stops guessing and tampering.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "../db";

export const SESSION_COOKIE = "dh_session";
export const SESSION_DAYS = 30;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (at least 32 characters)");
  return s;
}

export function sign(value: string, key = secret()): string {
  return `${value}.${createHmac("sha256", key).update(value).digest("base64url")}`;
}

/** Returns the signed value, or null if the signature is missing or wrong. */
export function unsign(signed: string | undefined, key = secret()): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf(".");
  if (i <= 0) return null;
  const value = signed.slice(0, i);
  const a = Buffer.from(sign(value, key));
  const b = Buffer.from(signed);
  return a.length === b.length && timingSafeEqual(a, b) ? value : null;
}

export async function createSession(waId: string): Promise<{ cookie: string; maxAge: number }> {
  const [row] = await db()`
    insert into web_sessions (wa_id, expires_at) values (${waId}, now() + make_interval(days => ${SESSION_DAYS}))
    returning id`;
  return { cookie: sign(row.id), maxAge: SESSION_DAYS * 86_400 };
}

/** The signed-in WhatsApp number for this request, or null. */
export async function currentWaId(): Promise<string | null> {
  const id = unsign((await cookies()).get(SESSION_COOKIE)?.value);
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await db()`select wa_id from web_sessions where id = ${id} and expires_at > now()`;
  return row?.wa_id ?? null;
}

export async function endSession(): Promise<void> {
  const id = unsign((await cookies()).get(SESSION_COOKIE)?.value);
  if (id && /^[0-9a-f-]{36}$/.test(id)) await db()`delete from web_sessions where id = ${id}`;
}

export const sessionCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});
