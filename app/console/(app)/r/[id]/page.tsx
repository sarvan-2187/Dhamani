import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { RequestActions } from "@/components/console/forms";
import { Card } from "@/components/ui/card";
import { StatusBadge, type RequestStatus } from "@/components/ui/StatusBadge";
import type { RequestAction } from "@/lib/console/actions";
import { requireCoordinator } from "@/lib/console/auth";
import { loadRequestDetail, type RequestDetail } from "@/lib/console/read";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Which actions this request allows now (PRD 7.3). The server re-checks each one. */
function allowedActions(r: RequestDetail): RequestAction[] {
  const live = r.status === "open" || r.status === "held" || r.status === "frozen";
  if (!live) return [];
  const out: RequestAction[] = [];
  if (r.status === "held") out.push("release");
  if (r.hasSlip && r.trust === "unverified") out.push("approve_slip");
  if (r.trust !== "coordinator_verified") out.push("verify");
  if (r.status === "frozen") out.push("unfreeze");
  if (r.status === "open") out.push("freeze");
  out.push("cancel");
  return out;
}

export default async function ConsoleRequestPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCoordinator();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [r, t, tAll, format] = await Promise.all([loadRequestDetail(id), getTranslations("console"), getTranslations(), getFormatter()]);
  if (!r) notFound();

  const when = (s: string) => format.dateTime(new Date(s), { dateStyle: "medium", timeStyle: "short" });
  const waves = [...new Set(r.alerts.map((a) => a.wave))];
  const facts: [string, string][] = [
    [t("detail.patient"), r.patientLabel ?? t("detail.patientRemoved")],
    [t("detail.hospital"), `${r.hospital}, ${r.city}`],
    [t("detail.neededBy"), when(r.neededBy)],
    [t("detail.expires"), when(r.expiresAt)],
    [t("detail.posted"), when(r.createdAt)],
    [t("detail.wave"), String(r.currentWave)],
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/console"
        className="inline-flex min-h-12 items-center gap-2 self-start rounded-md text-base font-medium text-brand-ink focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
      >
        <ArrowLeft size={20} strokeWidth={1.75} aria-hidden />
        {t("detail.back")}
      </Link>

      <Card className="gap-4 px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="text-display text-brand-ink">{r.group === "bombay" ? tAll("bloodGroup.bombay") : r.group}</span>
            <div className="flex flex-col">
              <h1 className="font-mono text-h2">{r.code}</h1>
              <p className="text-base font-semibold">
                {tAll(`component.${r.component}` as never)} · {r.units}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <StatusBadge status={r.status as RequestStatus} />
            <span className="text-sm font-medium">{t(`trust.${r.trust}` as never)}</span>
          </div>
        </div>
        {(r.isCritical || r.escalated || r.reports > 0) && (
          <ul className="flex flex-col gap-1 text-sm font-medium text-brand-ink">
            {r.isCritical && <li>{t("detail.critical")}</li>}
            {r.escalated && <li>{t("detail.escalated")}</li>}
            {r.reports > 0 && <li>{t("row.reports", { count: r.reports })}</li>}
          </ul>
        )}
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {facts.map(([k, v]) => (
            <div key={k} className="flex min-w-0 flex-col">
              <dt className="text-sm text-muted-foreground">{k}</dt>
              <dd className="text-base break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="gap-4 px-6">
        <h2 className="text-h2">{t("detail.actions")}</h2>
        <RequestActions id={r.id} actions={allowedActions(r)} />
      </Card>

      <Card className="gap-4 px-6">
        <h2 className="text-h2">{t("detail.slip")}</h2>
        {r.hasSlip ? (
          // A private, per-request image behind the console session: next/image would cache it.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/console/slip/${r.id}`}
            alt={t("detail.slipAlt", { code: r.code })}
            className="max-h-[560px] w-auto max-w-full self-start rounded-md border border-border"
          />
        ) : (
          <p className="text-base text-muted-foreground">{t("detail.noSlip")}</p>
        )}
      </Card>

      <Card className="gap-4 px-6">
        <h2 className="text-h2">{t("detail.confirmations")}</h2>
        {r.confirmations.length === 0 ? (
          <p className="text-base text-muted-foreground">{t("detail.noConfirmations")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {r.confirmations.map((c, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 py-3">
                <span className="text-base font-medium">{c.firstName}</span>
                <span className="text-sm text-muted-foreground">
                  {tAll(`live.eta.${c.eta}` as never)} · {c.arrived ? t("detail.arrived") : t("detail.notArrived")}
                  {c.donated !== null && ` · ${c.donated ? t("detail.donatedYes") : t("detail.donatedNo")}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="gap-4 px-6">
        <h2 className="text-h2">{t("detail.timeline")}</h2>
        {waves.length === 0 ? (
          <p className="text-base text-muted-foreground">{t("detail.noAlerts")}</p>
        ) : (
          waves.map((w) => {
            const list = r.alerts.filter((a) => a.wave === w);
            return (
              <div key={w} className="flex flex-col gap-2">
                <h3 className="text-base font-semibold">
                  {t("detail.waveTitle", { wave: w, count: list.length })} · {when(list[0].sentAt)}
                </h3>
                <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                  {list.map((a, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                      <span className="text-base">
                        {a.firstName}
                        {a.synthetic && <span className="text-sm text-muted-foreground"> ({t("detail.simulated")})</span>}
                      </span>
                      <span className="text-sm font-medium">{t(`response.${a.response}` as never)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
        <p className="text-sm text-muted-foreground">{t("detail.noPhones")}</p>
      </Card>

      <Card className="gap-4 px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-h2">{t("detail.activity")}</h2>
          <Link
            href={`/console/messages?code=${r.code}`}
            className="inline-flex min-h-12 items-center rounded-md text-base font-medium text-brand-ink underline focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
          >
            {t("detail.messages")}
          </Link>
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {r.audit.map((a, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
              <span>
                <span className="font-medium">{a.who}</span> <span className="font-mono">{a.action}</span>
              </span>
              <span className="text-muted-foreground">{when(a.at)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
