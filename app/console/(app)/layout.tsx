import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { logoutAction } from "@/app/console/actions";
import { ConsoleNav } from "@/components/console/forms";
import { Button } from "@/components/ui/button";
import { requireCoordinator } from "@/lib/console/auth";
import { simulationEnabled } from "@/lib/console/simulation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

// PRD 10.5. Wider than the public pages (960px) because coordinators work on laptops; still one column.
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const me = await requireCoordinator();
  const t = await getTranslations("console");
  const items = [
    { href: "/console", label: t("nav.queues") },
    { href: "/console/messages", label: t("nav.messages") },
    { href: "/console/referrals", label: t("nav.referrals") },
    ...(simulationEnabled() ? [{ href: "/console/simulation", label: t("nav.simulation") }] : []),
    ...(me.role === "super_admin" ? [{ href: "/console/admin", label: t("nav.admin") }] : []),
  ];
  return (
    <div data-wide className="mx-auto flex max-w-[960px] flex-col gap-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col">
          <p className="text-h2">{t("title")}</p>
          <p className="text-sm text-muted-foreground">
            {t("signedInAs", { name: me.name })} · {t(`roles.${me.role}`)}
          </p>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost">
            {t("nav.signOut")}
          </Button>
        </form>
      </div>
      <ConsoleNav items={items} />
      {children}
    </div>
  );
}
