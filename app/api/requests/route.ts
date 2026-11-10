// PRD 10.2: create a request (sign-in required). Open requests fire wave 1 before this returns.
import { NextResponse } from "next/server";
import { getLocale } from "next-intl/server";
import { currentWaId } from "@/lib/auth/session";
import { createRequest } from "@/lib/requests/create";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // wave 1 sends up to 10 alerts

export async function POST(req: Request) {
  const waId = await currentWaId();
  if (!waId) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const locale = await getLocale();
  const r = await createRequest(body, waId, new Date(), locale === "ta" || locale === "te" ? locale : "en");
  return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: 400 });
}
