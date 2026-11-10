// PRD 8.1: reverse WhatsApp OTP. The browser gets a code; the person sends "LOGIN <code>" from WhatsApp;
// the webhook ties the code to their number; the browser polls and then gets a session.
import { createHmac, randomBytes, randomInt } from "node:crypto";
import { db } from "../db";

export const LOGIN_CODE_MINUTES = 10;
export const LOGIN_RATE = { max: 5, minutes: 10 }; // per IP (PRD 13)
export const NONCE_COOKIE = "dh_login_nonce";

const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

/** "DH-4821-7Q": four digits and two letters, easy to read aloud. */
export function newLoginCode(): string {
  const digits = String(randomInt(0, 10_000)).padStart(4, "0");
  return `DH-${digits}-${LETTERS[randomInt(LETTERS.length)]}${LETTERS[randomInt(LETTERS.length)]}`;
}

export const LOGIN_CODE_RE = /^DH-\d{4}-[A-Z0-9]{2}$/;

/** "LOGIN dh-4821-7q" (any case or spacing) to "DH-4821-7Q"; null if it is not a login message. */
export function parseLoginMessage(text: string): string | null {
  const m = /^\s*LOGIN\s+(DH\s*-?\s*\d{4}\s*-?\s*[A-Z0-9]{2})\s*$/i.exec(text);
  if (!m) return null;
  const compact = m[1].toUpperCase().replace(/[\s-]/g, "");
  return `${compact.slice(0, 2)}-${compact.slice(2, 6)}-${compact.slice(6)}`;
}

export function hashIp(ip: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "").update(ip).digest("base64url");
}

export type StartResult = { ok: true; code: string; nonce: string } | { ok: false; reason: "rate_limited" };

export async function startLogin(ip: string): Promise<StartResult> {
  const sql = db();
  const ipHash = hashIp(ip);
  const [{ n }] = await sql`
    select count(*)::int as n from login_codes
    where ip_hash = ${ipHash} and created_at > now() - make_interval(mins => ${LOGIN_RATE.minutes})`;
  if (n >= LOGIN_RATE.max) return { ok: false, reason: "rate_limited" };

  const nonce = randomBytes(24).toString("base64url");
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newLoginCode();
    const rows = await sql`
      insert into login_codes (code, web_nonce, expires_at, ip_hash)
      values (${code}, ${nonce}, now() + make_interval(mins => ${LOGIN_CODE_MINUTES}), ${ipHash})
      on conflict (code) do nothing returning code`;
    if (rows.length) return { ok: true, code, nonce };
  }
  throw new Error("could not allocate a login code");
}

/** Called by the webhook. Returns true if the code was valid and is now tied to this number. */
export async function confirmLogin(code: string, waId: string): Promise<boolean> {
  const rows = await db()`
    update login_codes set wa_id = ${waId}, confirmed_at = now()
    where code = ${code} and confirmed_at is null and expires_at > now()
    returning code`;
  return rows.length === 1;
}

/** Called by the browser poll with its nonce. Returns the number once confirmed; the code is single-use. */
export async function claimLogin(nonce: string): Promise<{ status: "pending" | "expired" } | { status: "confirmed"; waId: string }> {
  const sql = db();
  const [row] = await sql`select code, wa_id, confirmed_at, expires_at > now() as live from login_codes where web_nonce = ${nonce}`;
  if (!row) return { status: "expired" };
  if (!row.confirmed_at) return { status: row.live ? "pending" : "expired" };
  await sql`delete from login_codes where code = ${row.code}`; // single use
  return { status: "confirmed", waId: row.wa_id };
}
