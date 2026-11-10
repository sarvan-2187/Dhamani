"use client";

// PRD 10.3 live request page: polls every 2 s while open. Public: card, donors by first name and ETA, report.
// Owner: alerted count, Arrived per donor, Fulfilled, Cancel (two steps, no browser dialogs), slip upload.
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { readSlip } from "@/lib/ocr";
import type { RequestView } from "@/lib/requests/view";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Notice } from "./ui/Notice";
import { RequestCard } from "./ui/RequestCard";
import { StatusBadge } from "./ui/StatusBadge";

const CLOSED = new Set(["fulfilled", "expired", "cancelled"]);
const fileInput =
  "min-h-12 w-full text-base file:mr-4 file:min-h-12 file:rounded-md file:border file:border-border-control file:bg-surface file:px-4 file:text-ink focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2";

export function LiveRequest({ initial, shareUrl }: { initial: RequestView; shareUrl: string }) {
  const t = useTranslations("live");
  const locale = useLocale();
  const [view, setView] = useState(initial);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const closed = CLOSED.has(view.status);
  const owner = view.owner;

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/requests/${initial.slug}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setView(await r.json());
  }, [initial.slug]);

  useEffect(() => {
    if (closed) return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [closed, refresh]);

  async function act(body: Record<string, string>) {
    setBusy(true);
    const r = await fetch(`/api/requests/${view.slug}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setMessage(r?.ok ? null : t("actionFailed"));
    setConfirmCancel(false);
    await refresh();
    setBusy(false);
  }

  async function report() {
    const r = await fetch(`/api/requests/${view.slug}/report`, { method: "POST" }).catch(() => null);
    setMessage(r?.ok ? t("reported") : t("actionFailed"));
  }

  async function uploadSlip(file: File) {
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("ocrText", await readSlip(file, locale).catch(() => ""));
    const r = await fetch(`/api/requests/${view.slug}/slip`, { method: "POST", body: fd }).catch(() => null);
    const j = r?.ok ? await r.json() : null;
    setMessage(j ? t(j.verified ? "slipVerified" : "slipReview") : t("actionFailed"));
    await refresh();
    setBusy(false);
  }

  const eta = (e: string | null) => t(`eta.${e ?? "none"}`);
  const rows = owner?.confirmations ?? view.donors.map((d, i) => ({ ...d, id: String(i), arrived: false }));

  return (
    <div className="flex flex-col gap-8">
      {view.status === "held" && <Notice variant="info" title={t("heldTitle")}><p>{t("heldBody")}</p></Notice>}
      {view.status === "frozen" && <Notice variant="info" title={t("frozenTitle")}><p>{t("frozenBody")}</p></Notice>}
      {view.status === "fulfilled" && <Notice variant="info" title={t("closedFulfilled")} />}
      {(view.status === "expired" || view.status === "cancelled") && <Notice variant="info" title={t("closed")} />}

      {owner && (
        <div className="flex flex-col gap-1">
          {owner.patientLabel && <p className="text-sm text-ink-muted">{t("forPatient", { patient: owner.patientLabel })}</p>}
          {view.status === "open" && <p className="text-base">{t("alerted", { count: owner.alerted })}</p>}
        </div>
      )}

      <RequestCard
        group={view.group}
        status={view.status}
        component={view.component}
        units={view.units}
        hospital={view.hospital.name}
        area={view.hospital.city}
        neededBy={new Date(view.neededBy)}
        expiresAt={new Date(view.expiresAt)}
        confirmed={view.confirmed}
        target={view.target}
        code={view.code}
        shareUrl={shareUrl}
      />

      <section className="flex flex-col gap-4">
        <h2 className="text-h2">{t("donorsTitle")}</h2>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-control p-6 text-center text-base text-ink-muted">{t("noDonorsYet")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface-raised shadow-card">
            {rows.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div className="flex flex-col">
                  <span className="text-base font-medium">{d.firstName}</span>
                  <span className="text-sm text-ink-muted">{eta(d.eta)}</span>
                </div>
                {owner &&
                  (d.arrived ? (
                    <StatusBadge status="fulfilled" label={t("arrived")} />
                  ) : (
                    <Button variant="outline" disabled={busy} onClick={() => act({ action: "arrived", confirmationId: d.id })}>
                      {t("markArrived")}
                    </Button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      {message && <p className="text-sm font-medium" aria-live="polite">{message}</p>}

      {owner && !closed && (
        <Card className="gap-4 px-6">
          {!owner.hasSlip && (view.status === "open" || view.status === "held") && (
            <div className="flex flex-col gap-2">
              <label htmlFor="slip" className="text-sm font-medium text-ink">{t("slipTitle")}</label>
              <input id="slip" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => e.target.files?.[0] && uploadSlip(e.target.files[0])} className={fileInput} />
            </div>
          )}
          {view.status === "open" && (
            <Button className="w-full" disabled={busy} onClick={() => act({ action: "fulfilled" })}>
              {t("markFulfilled")}
            </Button>
          )}
          {confirmCancel ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={() => act({ action: "cancel" })}>{t("confirmCancel")}</Button>
              <Button variant="ghost" onClick={() => setConfirmCancel(false)}>{t("keepOpen")}</Button>
            </div>
          ) : (
            view.status !== "frozen" && <Button variant="ghost" onClick={() => setConfirmCancel(true)}>{t("cancel")}</Button>
          )}
        </Card>
      )}

      {!owner && !closed && (
        <Button variant="ghost" onClick={report}>
          {t("report")}
        </Button>
      )}
    </div>
  );
}
