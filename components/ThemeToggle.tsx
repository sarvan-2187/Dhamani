"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import { THEME_COOKIE } from "@/lib/theme";

/** Overrides the system theme; the cookie lets the server render the same class. */
export function ThemeToggle() {
  const t = useTranslations("header");
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    document.cookie = `${THEME_COOKIE}=${next ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
    setDark(next);
  }

  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggle}
      className={
        "inline-flex min-h-12 min-w-12 items-center justify-center rounded-md text-ink hover:bg-surface-subtle " +
        "focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
      }
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden />
      <span className="sr-only">{dark ? t("themeLight") : t("themeDark")}</span>
    </button>
  );
}
