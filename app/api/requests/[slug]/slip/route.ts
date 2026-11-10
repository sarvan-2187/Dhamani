// PRD 10.2 slip: the requester uploads the photo with the OCR text read on the phone. A match (hospital words +
// blood group) marks the request slip_verified; otherwise it waits for coordinator review (M7).
import { NextResponse } from "next/server";
import { currentWaId } from "@/lib/auth/session";
import { groupFromDb } from "@/lib/blood/compat";
import { db } from "@/lib/db";
import { slipMatches } from "@/lib/requests/slip";
import { SLUG_RE } from "@/lib/requests/slug";

export const dynamic = "force-dynamic";
const MAX_SLIP_BYTES = 3 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const waId = await currentWaId();
  if (!waId) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const ocrText = String(form?.get("ocrText") ?? "").slice(0, 20_000);
  if (!(file instanceof File) || !TYPES.has(file.type)) return NextResponse.json({ error: "file_type" }, { status: 400 });
  if (file.size > MAX_SLIP_BYTES) return NextResponse.json({ error: "file_size" }, { status: 400 });

  const sql = db();
  const [r] = await sql`
    select r.id, r.abo, r.rh, r.is_bombay, h.name as hospital
    from requests r join hospitals h on h.id = r.hospital_id
    where r.public_slug = ${slug} and r.requester_wa_id = ${waId}`;
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const bytes = Buffer.from(await file.arrayBuffer());
  await sql`
    insert into request_slips (request_id, content, content_type) values (${r.id}, ${"\\x" + bytes.toString("hex")}::bytea, ${file.type})
    on conflict (request_id) do update set content = excluded.content, content_type = excluded.content_type, uploaded_at = now()`;

  const verified = slipMatches(ocrText, r.hospital, groupFromDb(r as never));
  if (verified) {
    await sql`
      update requests set trust_level = 'slip_verified', slip_verified_at = now()
      where id = ${r.id} and trust_level = 'unverified'`;
  }
  await sql`insert into audit_log (actor, action, request_id) values (${waId}, ${verified ? "slip_verified_ocr" : "slip_uploaded_for_review"}, ${r.id})`;
  return NextResponse.json({ ok: true, verified });
}
