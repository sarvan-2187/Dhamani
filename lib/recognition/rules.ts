// PRD 11 / 10.4 / 8.2: Lifegiver tiers, the certificate name rule, and the signed /me link. Pure.
import { createHmac, timingSafeEqual } from "node:crypto";

/** Lifegiver badges at 1, 3, 5 and 10 verified donations (PRD 10.4). */
export const TIERS = [1, 3, 5, 10] as const;

/** The highest badge reached, or 0 before the first verified donation. */
export function tierFor(verified: number): number {
  return TIERS.filter((t) => verified >= t).at(-1) ?? 0;
}

/** Certificates print in English letters only (owner decision 2026-11-10; the DB has the same check). */
export const CERT_NAME_RE = /^[A-Za-z][A-Za-z .'-]{0,39}$/;

export const ME_LINK_HOURS = 24;

const sig = (payload: string, key: string) => createHmac("sha256", key).update(`me:${payload}`).digest("base64url");

/** "<donor id>.<expiry, unix seconds>.<HMAC>", valid for 24 h (PRD 8.2). */
export function signMeToken(donorId: string, now: Date, key: string): string {
  const payload = `${donorId}.${Math.floor(now.getTime() / 1000) + ME_LINK_HOURS * 3600}`;
  return `${payload}.${sig(payload, key)}`;
}

/** The donor id, or null if the token is malformed, tampered with or expired. */
export function verifyMeToken(token: string | undefined, now: Date, key: string): string | null {
  const m = /^([0-9a-f-]{36})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token ?? "");
  if (!m) return null;
  const want = Buffer.from(sig(`${m[1]}.${m[2]}`, key));
  const got = Buffer.from(m[3]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return Number(m[2]) * 1000 > now.getTime() ? m[1] : null;
}
