"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Share2 } from "lucide-react";
import { Button } from "./button";
import { StatusBadge, type RequestStatus } from "./StatusBadge";

export type Component = "whole_blood" | "prbc" | "platelets_rdp" | "platelets_sdp" | "ffp";

type Props = {
  /** "O+", "AB-" or "bombay" */
  group: string;
  status: RequestStatus;
  component: Component;
  units: number;
  hospital: string;
  area: string;
  neededBy: Date;
  expiresAt: Date;
  confirmed: number;
  target: number;
  code: string;
  shareUrl: string;
};

/** Patient first name and initial only. Never any phone number. */
export function RequestCard(p: Props) {
  const t = useTranslations("request");
  const tc = useTranslations("component");
  const tg = useTranslations("bloodGroup");
  const format = useFormatter();
  const [copied, setCopied] = useState(false);
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });
  const pct = p.target > 0 ? Math.min(p.confirmed / p.target, 1) * 100 : 0;

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ url: p.shareUrl });
        return;
      } catch {
        // Cancelled or unsupported: fall back to copy.
      }
    }
    await navigator.clipboard.writeText(p.shareUrl);
    setCopied(true);
  }

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-display text-brand-ink">{p.group === "bombay" ? tg("bombay") : p.group}</p>
        <StatusBadge status={p.status} />
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-base text-ink">
          {tc(p.component)} · {t("units", { count: p.units })}
        </p>
        <p className="text-base text-ink">
          {p.hospital}, {p.area}
        </p>
        <p className="text-sm text-ink-muted">{t("neededBy", { time: when(p.neededBy) })}</p>
        <p className="text-sm text-ink-muted">{t("expires", { time: when(p.expiresAt) })}</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-base font-medium text-ink">{t("progress", { confirmed: p.confirmed, target: p.target })}</p>
        <div aria-hidden className="h-2 rounded-sm bg-surface-subtle border border-border overflow-hidden">
          <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-sm text-ink-muted">
          <span className="sr-only">{t("code")}: </span>
          {p.code}
        </p>
        <div className="flex items-center gap-2">
          <span aria-live="polite" className="text-sm text-ink-muted">
            {copied ? t("copied") : ""}
          </span>
          <Button variant="outline" onClick={share}>
            <Share2 size={20} strokeWidth={1.75} aria-hidden />
            {t("share")}
          </Button>
        </div>
      </div>
    </article>
  );
}
