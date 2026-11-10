import { redirect } from "next/navigation";
import { RequestForm } from "@/components/RequestForm";
import { currentWaId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  if (!(await currentWaId())) redirect("/login?next=/request/new");
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-8 px-4 py-8">
      <RequestForm />
    </main>
  );
}
