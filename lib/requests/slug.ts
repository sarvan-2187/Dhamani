import { randomInt } from "node:crypto";

// 31 characters, no 0/o, 1/i/l: easy to read aloud and to type from a screenshot.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

/** 8-character URL-safe slug for /r/[slug] (PRD 5: public_slug). */
export function newSlug(): string {
  return Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

export const SLUG_RE = /^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/;

/** Short human code shown on the card and in WhatsApp, e.g. "DH-7Q4K". */
export function requestCode(slug: string): string {
  return `DH-${slug.slice(0, 4).toUpperCase()}`;
}
