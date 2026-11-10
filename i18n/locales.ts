// Shared by server config and the client language switcher, so no server imports here.
export const locales = ["en", "ta", "te"] as const;
export type Locale = (typeof locales)[number];
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return locales.includes(value as Locale);
}
