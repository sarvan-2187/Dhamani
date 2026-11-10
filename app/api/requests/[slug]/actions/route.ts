// PRD 10.3 owner actions: Fulfilled, Cancel, Arrived (per donor). Only the requester's WhatsApp number may act.
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentWaId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { closeRequest } from "@/lib/matching/close";
import { verifyIfReady } from "@/lib/recognition/verify";
import { SLUG_RE } from "@/lib/requests/slug";

export const dynamic = "force-dynamic";

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("fulfilled") }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("arrived"), confirmationId: z.string().uuid() }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const waId = await currentWaId();
  if (!waId) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!SLUG_RE.test(slug) || !parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const sql = db();
  const [r] = await sql`select id, status from requests where public_slug = ${slug} and requester_wa_id = ${waId}`;
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const a = parsed.data;
  let changed = 0;
  if (a.action === "fulfilled" || a.action === "cancel") {
    // Closing also tells confirmed donors the outcome (PRD 7.3).
    const ok = (a.action === "fulfilled" ? r.status === "open" : r.status === "open" || r.status === "held") &&
      (await closeRequest(r.id, a.action === "fulfilled" ? "fulfilled" : "cancelled", { actor: waId }));
    if (!ok) return NextResponse.json({ error: "not_allowed" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } else {
    changed = (await sql`
      update confirmations set requester_marked_arrived = true
      where id = ${a.confirmationId} and request_id = ${r.id} returning id`).length;
  }
  if (!changed) return NextResponse.json({ error: "not_allowed" }, { status: 409 });
  await sql`insert into audit_log (actor, action, request_id) values (${waId}, ${`owner_${a.action}`}, ${r.id})`;
  // If the donor already said they donated, this verifies it and sends the certificate (PRD 11).
  await verifyIfReady(a.confirmationId);
  return NextResponse.json({ ok: true });
}
