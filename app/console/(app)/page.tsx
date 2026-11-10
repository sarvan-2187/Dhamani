import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { StatusBadge, type RequestStatus } from "@/components/ui/StatusBadge";
import { requireCoordinator } from "@/lib/console/auth";
import { loadQueues, TABS, type Tab } from "@/lib/console/read";
import { cn } from "@/lib/utils";

// PRD 10.5 queue tabs: Held, Needs slip review, Escalated, Reported/Frozen, All open.
export default async function QueuesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireCoordinator();
  const raw = (await searchParams).tab;
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : "held";
  const [{ counts, rows }, t, tAll, format] = await Promise.all([
    loadQueues(tab),
    getTranslations("console"),
    getTranslations(),
    getFormatter(),
  ]);

  return (
    <section className="flex flex-col gap-6">
      <nav className="flex flex-wrap gap-2" aria-label={t("nav.queues")}>
        {TABS.map((x) => (
          <Link
            key={x}
            href={`/console?tab=${x}`}
            aria-current={x === tab ? "page" : undefined}
            className={cn(
              "inline-flex min-h-12 items-center gap-2 rounded-md border px-4 text-base font-medium",
              "focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2",
              x === tab ? "border-ink bg-ink text-surface" : "border-input bg-background hover:bg-muted",
            )}
          >
            {t(`tabs.${x}`)}
            <span className={cn("rounded-full px-2 text-sm tabular-nums", x === tab ? "bg-surface text-ink" : "bg-muted")}>{counts[x]}</span>
          </Link>
        ))}
      </nav>
      <p className="text-base text-muted-foreground">{t(`tabHint.${tab}`)}</p>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input p-8 text-center text-base text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/console/r/${r.id}`}
                className={cn(
                  "flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border bg-card p-4 shadow-card hover:bg-muted",
                  "focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2",
                )}
              >
                <div className="flex min-w-0 items-start gap-4">
                  <span className="min-w-14 text-h1 text-brand-ink">{r.group === "bombay" ? tAll("bloodGroup.bombay") : r.group}</span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-mono text-sm font-medium">{r.code}</span>
                    <span className="text-base font-semibold">
                      {tAll(`component.${r.component}` as never)} · {r.units}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {r.hospital}, {r.city}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  <StatusBadge status={r.status as RequestStatus} />
                  <span className="text-sm font-medium">{t(`trust.${r.trust}` as never)}</span>
                  <span className="text-sm text-muted-foreground">{t("row.progress", { confirmed: r.confirmed, alerted: r.alerted })}</span>
                  {r.reports > 0 && <span className="text-sm font-medium text-brand-ink">{t("row.reports", { count: r.reports })}</span>}
                  <span className="text-sm text-muted-foreground">
                    {t("row.posted", { time: format.dateTime(new Date(r.createdAt), { dateStyle: "medium", timeStyle: "short" }) })}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
