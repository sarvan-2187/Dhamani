// PRD 10.3 live updates: the request page polls this every 2 s (replaces Supabase Realtime).
import { NextResponse } from "next/server";
import { currentWaId } from "@/lib/auth/session";
import { SLUG_RE } from "@/lib/requests/slug";
import { loadRequestView } from "@/lib/requests/view";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const view = await loadRequestView(slug, await currentWaId());
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
