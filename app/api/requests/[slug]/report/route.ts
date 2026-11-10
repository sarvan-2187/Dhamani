// PRD 10.3 / 13: anyone can report a request; 2 reports freeze it for a coordinator. One report per browser.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SLUG_RE } from "@/lib/requests/slug";

export const dynamic = "force-dynamic";
const FREEZE_AT_REPORTS = 2;

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const marker = `dh_reported_${slug}`;
  if ((await cookies()).get(marker)) return NextResponse.json({ ok: true, alreadyReported: true });

  const sql = db();
  const [r] = await sql`
    update requests set report_count = report_count + 1,
           status = case when status = 'open' and report_count + 1 >= ${FREEZE_AT_REPORTS} then 'frozen'::request_status else status end
    where public_slug = ${slug} returning id, status`;
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await sql`insert into audit_log (actor, action, request_id) values ('public', ${r.status === "frozen" ? "reported_frozen" : "reported"}, ${r.id})`;

  const res = NextResponse.json({ ok: true });
  res.cookies.set(marker, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 86_400 });
  return res;
}
