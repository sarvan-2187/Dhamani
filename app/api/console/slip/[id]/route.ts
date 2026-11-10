// PRD 10.5: the slip image, for signed-in coordinators only. Never cached, never sniffed.
import { currentCoordinator } from "@/lib/console/auth";
import { loadSlip } from "@/lib/console/read";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentCoordinator())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const slip = UUID.test(id) ? await loadSlip(id) : null;
  if (!slip) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(slip.bytes), {
    headers: {
      "Content-Type": slip.type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
