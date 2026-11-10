// PRD 10.4: certificate download from /me. Same signed 24 h token; the confirmation must be this donor's and verified.
import { db } from "@/lib/db";
import { verifyMeToken } from "@/lib/recognition/rules";
import { certificateFor } from "@/lib/recognition/verify";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const donorId = verifyMeToken(new URL(req.url).searchParams.get("t") ?? undefined, new Date(), process.env.SESSION_SECRET ?? "");
  if (!donorId || !UUID.test(id)) return new Response("Not found", { status: 404 });
  const [mine] = await db()`select 1 from confirmations where id = ${id} and donor_id = ${donorId} and verified_at is not null`;
  const cert = mine ? await certificateFor(id) : null;
  if (!cert) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(cert.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${cert.filename}"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
