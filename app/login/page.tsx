import { redirect } from "next/navigation";
import { LoginFlow } from "@/components/LoginFlow";
import { currentWaId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Only same-site paths, so the redirect after sign-in cannot be pointed elsewhere. */
const safeNext = (next?: string) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/request/new");

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentWaId()) redirect(next);
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-8 px-4 py-8">
      <LoginFlow next={next} />
    </main>
  );
}
