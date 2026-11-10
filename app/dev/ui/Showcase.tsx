"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/Field";
import { BloodGroupPicker, type BloodGroupChoice } from "@/components/ui/BloodGroupPicker";
import { StatusBadge, type RequestStatus } from "@/components/ui/StatusBadge";
import { RequestCard } from "@/components/ui/RequestCard";
import { Notice } from "@/components/ui/Notice";
import { Logo, LogoMark } from "@/components/Logo";

const STATUSES: RequestStatus[] = ["open", "fulfilled", "expired", "cancelled", "held", "frozen"];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-h2">{title}</h2>
      {children}
    </div>
  );
}

export function Showcase() {
  const t = useTranslations();
  const [group, setGroup] = useState<BloodGroupChoice | null>("O+");

  return (
    <>
      <Section title="Brand">
        <div className="flex flex-wrap items-center gap-6">
          <Logo />
          <span className="text-ink-muted">
            <LogoMark size={24} />
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element -- generated icon preview */}
          <img src="/icons/192" alt="App icon" width={48} height={48} className="rounded-md" />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- generated OG preview */}
        <img src="/opengraph-image" alt="Social preview" width={560} height={294} className="h-auto w-full rounded-md border border-border" />
      </Section>

      <Section title="Button">
        <div className="flex flex-wrap gap-2">
          <Button>{t("common.postRequest")}</Button>
          <Button variant="outline">{t("request.share")}</Button>
          <Button variant="ghost">{t("common.cancel")}</Button>
        </div>
        <div className="flex flex-col gap-2">
          <Button className="w-full" disabled>
            {t("common.postRequest")}
          </Button>
          <p className="text-sm text-ink-muted">{t("common.chooseGroupFirst")}</p>
        </div>
      </Section>

      <Section title="Field">
        <Field label={t("requestForm.patientLabel")} hint={t("requestForm.patientHint")} />
        <Field label={t("requestForm.patientLabel")} error={t("requestForm.patientError")} defaultValue="P" />
      </Section>

      <Section title="BloodGroupPicker">
        <BloodGroupPicker value={group} onChange={setGroup} />
        <p className="text-sm text-ink-muted">Tap Don&apos;t know to see the info Notice.</p>
      </Section>

      <Section title="StatusBadge">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section title="RequestCard">
        <RequestCard
          group="O+"
          status="open"
          component="whole_blood"
          units={2}
          hospital="DEV ONLY Test Hospital A"
          area="Sample area"
          neededBy={new Date("2026-11-10T14:00:00+05:30")}
          expiresAt={new Date("2026-11-10T16:00:00+05:30")}
          confirmed={2}
          target={3}
          code="DH-7Q4K"
          shareUrl="http://localhost:3000/r/sample00"
        />
        <RequestCard
          group="bombay"
          status="fulfilled"
          component="prbc"
          units={1}
          hospital="DEV ONLY Test Hospital B"
          area="Sample area"
          neededBy={new Date("2026-11-10T09:30:00+05:30")}
          expiresAt={new Date("2026-11-10T11:30:00+05:30")}
          confirmed={2}
          target={2}
          code="DH-2M9X"
          shareUrl="http://localhost:3000/r/sample01"
        />
      </Section>

      <Section title="Notice">
        <Notice title={t("rights.title")}>
          <p>{t("rights.body")}</p>
        </Notice>
        <Notice variant="info" title={t("bloodGroup.unknownTitle")}>
          <p>{t("bloodGroup.unknownBody")}</p>
        </Notice>
      </Section>
    </>
  );
}
