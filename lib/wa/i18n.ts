// WhatsApp copy through next-intl, kept out of the web bundle (messages/wa/*.json are never sent to the browser).
import { createTranslator } from "next-intl";
import en from "../../messages/wa/en.json";
import ta from "../../messages/wa/ta.json";
import te from "../../messages/wa/te.json";
import type { Lang } from "./types";

export const WA_MESSAGES = { en, ta, te } as const;
export const LANGS: readonly Lang[] = ["en", "ta", "te"];

export function waTranslator(lang: Lang) {
  return createTranslator({ locale: lang, messages: WA_MESSAGES[lang] });
}

/** "10 Nov 2026, 6:00 pm" in the reader's language, India time. */
export function formatDateTime(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(`${lang}-IN`, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(d);
}

/** "12 Dec 2026" in the reader's language, India time. */
export function formatDate(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(`${lang}-IN`, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);
}
