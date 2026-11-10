import { getFormatter, getTranslations } from "next-intl/server";
import { AccountsPanel } from "@/components/console/forms";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { listAccounts } from "@/lib/console/accounts";
import { requireCoordinator } from "@/lib/console/auth";
import { loadAuditLog, loadHospitals, loadSystemStatus } from "@/lib/console/read";
import { simulationEnabled } from "@/lib/console/simulation";
import { parseAllowlist } from "@/lib/wa/config";

// Super admin (owner request 2026-11-09): accounts, system status, hospitals, full audit log.
// Same donor rule as coordinators: no donor list, no phone numbers.
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireCoordinator({ superAdmin: true });
  const q = ((await searchParams).q ?? "").slice(0, 60);
  const [status, accounts, hospitals, audit, t, format] = await Promise.all([
    loadSystemStatus(),
    listAccounts(),
    loadHospitals(q),
    loadAuditLog(),
    getTranslations("console.admin"),
    getFormatter(),
  ]);
  const when = (s: string) => format.dateTime(new Date(s), { dateStyle: "medium", timeStyle: "short" });
  const facts: [string, string][] = [
    [t("hospitals"), String(status.hospitals)],
    [t("openRequests"), String(status.openRequests)],
    [t("messages24h"), String(status.messages24h)],
    [t("failed24h"), String(status.failed24h)],
    [t("lastInbound"), status.lastInbound ? when(status.lastInbound) : t("never")],
    [t("simulation"), simulationEnabled() ? t("on") : t("off")],
    [t("allowlist"), String(parseAllowlist(process.env.WA_ALLOWLIST).size)],
  ];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-h1">{t("title")}</h1>
      <Notice variant="info" title={t("noDonorList")} />

      <section className="flex flex-col gap-4">
        <h2 className="text-h2">{t("status")}</h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map(([k, v]) => (
            <div key={k} className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card p-4">
              <dt className="text-sm text-muted-foreground">{k}</dt>
              <dd className="text-h2 tabular-nums break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h2">{t("accounts")}</h2>
        <AccountsPanel accounts={accounts} meId={me.id} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h2">{t("hospitalSearch")}</h2>
        <form className="flex flex-wrap items-end gap-3" action="/console/admin">
          <div className="min-w-0 flex-1">
            <Field label={t("hospitalSearch")} hint={t("hospitalHint")} name="q" defaultValue={q} autoComplete="off" />
          </div>
          <Button type="submit" variant="outline" className="mb-7">
            {t("search")}
          </Button>
        </form>
        {hospitals.length === 0 ? (
          <p className="text-base text-muted-foreground">{t("noHospitals")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {hospitals.map((h, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                <span className="min-w-0 text-base">
                  {h.name}, <span className="text-muted-foreground">{h.city}</span>
                </span>
                <span className="text-sm font-medium">{h.apheresis ? t("apheresis") : t("noApheresis")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card className="gap-4 px-6">
        <h2 className="text-h2">{t("audit")}</h2>
        <ul className="flex flex-col divide-y divide-border">
          {audit.map((a, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
              <span className="min-w-0 break-words">
                <span className="font-medium">{a.who}</span> <span className="font-mono">{a.action}</span>
                {a.code && <span className="font-mono"> · {a.code}</span>}
              </span>
              <span className="text-muted-foreground">{when(a.at)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
