import { NextResponse } from "next/server";
import { endSession, SESSION_COOKIE } from "@/lib/auth/session";

export async function POST() {
  await endSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
