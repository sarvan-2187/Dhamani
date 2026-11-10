"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Notice } from "./Notice";

export const ABO_RH_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] as const;
export type BloodGroupChoice = (typeof ABO_RH_GROUPS)[number] | "bombay" | "unknown";

type Props = { value: BloodGroupChoice | null; onChange: (value: BloodGroupChoice) => void };

const chip =
  "min-h-14 rounded-md border border-border-control bg-surface text-ink hover:bg-surface-subtle " +
  "aria-pressed:bg-brand aria-pressed:border-brand aria-pressed:text-on-brand " +
  "focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2";

/**
 * Bombay is separate on purpose: it types as O on routine tests, and a Bombay patient given O blood reacts.
 * "Don't know" must block submission in the parent form; the picker shows the guidance.
 */
export function BloodGroupPicker({ value, onChange }: Props) {
  const t = useTranslations("bloodGroup");
  const labelId = useId();

  return (
    <div className="flex flex-col gap-2">
      <p id={labelId} className="text-sm font-medium text-ink">
        {t("label")}
      </p>
      <div role="group" aria-labelledby={labelId} className="grid grid-cols-4 gap-2">
        {ABO_RH_GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={value === g}
            onClick={() => onChange(g)}
            className={`${chip} text-xl font-semibold`}
          >
            {g}
          </button>
        ))}
        {(["bombay", "unknown"] as const).map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={value === g}
            onClick={() => onChange(g)}
            className={`${chip} col-span-2 px-2 text-base font-medium`}
          >
            {t(g)}
          </button>
        ))}
      </div>
      {value === "unknown" && (
        <div aria-live="polite">
          <Notice variant="info" title={t("unknownTitle")}>
            <p>{t("unknownBody")}</p>
          </Notice>
        </div>
      )}
    </div>
  );
}
