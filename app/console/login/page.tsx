import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/console/forms";
import { Card } from "@/components/ui/card";
import { currentCoordinator } from "@/lib/console/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

// PRD 8.3: email + password, accounts created by the seed or a super admin. No sign-up link.
export default async function ConsoleLoginPage() {
  if (await currentCoordinator()) redirect("/console");
  const t = await getTranslations("console.login");
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-8 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">{t("title")}</h1>
        <p className="text-base text-muted-foreground">{t("body")}</p>
      </div>
      <Card className="px-6">
        <LoginForm />
      </Card>
    </main>
  );
}
