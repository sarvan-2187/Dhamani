// PRD 8.1 step 1-2: create a login code, keep the nonce in a short-lived cookie, return the wa.me link.
import { NextResponse } from "next/server";
import { LOGIN_CODE_MINUTES, NONCE_COOKIE, startLogin } from "@/lib/auth/login";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const r = await startLogin(ip);
  if (!r.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const business = (process.env.WA_BUSINESS_NUMBER ?? "").replace(/\D/g, "");
  const res = NextResponse.json({
    code: r.code,
    waLink: `https://wa.me/${business}?text=${encodeURIComponent(`LOGIN ${r.code}`)}`,
    expiresInSeconds: LOGIN_CODE_MINUTES * 60,
  });
  res.cookies.set(NONCE_COOKIE, r.nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: LOGIN_CODE_MINUTES * 60,
  });
  return res;
}
