// PRD 8.1 step 4: the login page polls every 2 s; once WhatsApp confirmed the code, start a 30-day session.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { claimLogin, NONCE_COOKIE } from "@/lib/auth/login";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const nonce = (await cookies()).get(NONCE_COOKIE)?.value;
  if (!nonce) return NextResponse.json({ status: "expired" });
  const r = await claimLogin(nonce);
  if (r.status !== "confirmed") return NextResponse.json({ status: r.status });

  const session = await createSession(r.waId);
  const res = NextResponse.json({ status: "confirmed" });
  res.cookies.set(SESSION_COOKIE, session.cookie, sessionCookieOptions(session.maxAge));
  res.cookies.delete(NONCE_COOKIE);
  return res;
}
