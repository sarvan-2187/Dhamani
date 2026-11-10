import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { LiveRequest } from "@/components/LiveRequest";
import { currentWaId } from "@/lib/auth/session";
import { SLUG_RE } from "@/lib/requests/slug";
import { loadRequestView } from "@/lib/requests/view";

export const dynamic = "force-dynamic";

export default async function RequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) notFound();
  const view = await loadRequestView(slug, await currentWaId());
  if (!view) notFound();

  const h = await headers();
  const origin = process.env.APP_BASE_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-8 px-4 py-8">
      <LiveRequest initial={view} shareUrl={`${origin}/r/${slug}`} />
    </main>
  );
}
