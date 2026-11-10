"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { locales, LOCALE_COOKIE } from "@/i18n/locales";

export function LanguageSwitcher() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const id = useId();

  return (
    <div className="flex items-center gap-1">
      <label htmlFor={id} className="text-ink">
        <Languages size={20} strokeWidth={1.75} aria-hidden />
        <span className="sr-only">{t("header.language")}</span>
      </label>
      <select
        id={id}
        value={locale}
        onChange={(e) => {
          document.cookie = `${LOCALE_COOKIE}=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          router.refresh();
        }}
        className={
          "min-h-12 rounded-md border border-border-control bg-surface px-3 text-base text-ink " +
          "focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
        }
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {t(`languages.${l}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
