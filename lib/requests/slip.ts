// PRD 10.2: a slip is "verified" when its OCR text contains the hospital name tokens and the blood group.
// OCR runs on the phone (Tesseract.js), so this only lifts a request past wave 1; coordinators still review.
import type { BloodGroup } from "../blood/compat";

// Words every blood centre name shares; they prove nothing about which centre it is.
const GENERIC = new Set([
  "hospital", "hospitals", "blood", "bank", "centre", "center", "government", "govt", "medical", "college",
  "district", "general", "and", "the", "research", "institute", "society", "indian", "cross", "red", "ltd", "limited",
]);

const norm = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}+\- ]/gu, " ").replace(/\s+/g, " ");

export function hospitalTokens(name: string): string[] {
  return [...new Set(norm(name).split(" ").filter((w) => w.length >= 4 && !GENERIC.has(w)))];
}

const GROUP_WORDS: Record<string, string[]> = { "+": ["+", "pos", "positive", "+ve", "ve+"], "-": ["-", "neg", "negative", "-ve", "ve-"] };

/** True if `text` names this blood group: "O+", "O POS", "O Positive", "B -ve", "Bombay". */
export function mentionsGroup(text: string, group: BloodGroup): boolean {
  const t = norm(text);
  if (group === "bombay") return /\bbombay\b/.test(t) || /\boh\b/.test(t);
  const abo = group.slice(0, -1).toLowerCase();
  const sign = group.slice(-1);
  const words = GROUP_WORDS[sign].map((w) => w.replace(/[+\-]/g, (c) => `\\${c}`));
  const re = new RegExp(`(?:^|[^a-z])${abo}\\s*(?:${words.join("|")})`, "i");
  return re.test(t);
}

/** At least 60% of the distinctive hospital words, and the blood group. */
export function slipMatches(ocrText: string, hospitalName: string, group: BloodGroup): boolean {
  const tokens = hospitalTokens(hospitalName);
  const text = norm(ocrText);
  const found = tokens.filter((w) => text.includes(w)).length;
  const hospitalOk = tokens.length === 0 ? false : found / tokens.length >= 0.6;
  return hospitalOk && mentionsGroup(ocrText, group);
}
