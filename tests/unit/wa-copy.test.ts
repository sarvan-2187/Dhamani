// WhatsApp copy rules: same keys in en/ta/te, no em dashes or emoji, Meta's length limits, template rules,
// and TEMPLATES.md in sync with the copy.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../../messages/wa/en.json";
import ta from "../../messages/wa/ta.json";
import te from "../../messages/wa/te.json";
import { question, type OnbStep } from "../../lib/wa/flows/onboarding";
import { render } from "../../lib/wa/flows/reply";
import { TEMPLATE_DEFS, TEMPLATE_NAMES } from "../../lib/wa/templates";
import { renderTemplatesMarkdown } from "../../lib/wa/templates-md";

const COPIES = { en, ta, te } as const;
const LANGS = ["en", "ta", "te"] as const;

type Tree = { [k: string]: unknown };
function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((out, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") return { ...out, [key]: v };
    if (Array.isArray(v)) return { ...out, ...Object.fromEntries(v.map((x, i) => [`${key}.${i}`, String(x)])) };
    return { ...out, ...flatten(v as Tree, key) };
  }, {});
}
const flat = { en: flatten(en), ta: flatten(ta), te: flatten(te) };

describe("WhatsApp copy", () => {
  it.each(["ta", "te"] as const)("%s has exactly the same keys as en", (lang) => {
    expect(Object.keys(flat[lang]).sort()).toEqual(Object.keys(flat.en).sort());
  });

  it.each(LANGS)("%s has no em dashes, emoji or empty strings", (lang) => {
    for (const [key, value] of Object.entries(flat[lang])) {
      expect(value, key).not.toContain("—");
      expect(value, key).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(value.trim(), key).not.toBe("");
    }
  });

  it.each(LANGS)("%s fits Meta limits: buttons 20, list rows 24, list button 20, bodies 1024", (lang) => {
    const c = COPIES[lang];
    for (const [k, v] of Object.entries(c.buttons)) expect(v.length, `buttons.${k}`).toBeLessThanOrEqual(20);
    for (const v of Object.values(c.languageNames)) expect(v.length).toBeLessThanOrEqual(20);
    expect(c.groupButton.length).toBeLessThanOrEqual(20);
    expect(c.bombay.length).toBeLessThanOrEqual(24);
    expect(c.notSure.length).toBeLessThanOrEqual(24);
    for (const [k, v] of Object.entries(flat[lang])) expect(v.length, k).toBeLessThanOrEqual(1024);
  });
});

describe("rendering every onboarding question", () => {
  const steps: OnbStep[] = ["lang", "consent", "name", "group", "dob", "sex", "weight", "location", "last_donation", "radius", "night", "rare"];

  it.each(LANGS)("%s: no missing keys, no unfilled placeholders", (lang) => {
    for (const step of steps) {
      const r = render(question(step), lang);
      const s = r.kind === "text" ? r.text : JSON.stringify(r.interactive);
      expect(s, step).not.toMatch(/\{[a-z]+\}/);
      expect(s, step).not.toMatch(/"(buttons\.[a-z0-9]+|ask[A-Z][a-zA-Z]+|groupButton|notSure|consent)"/);
    }
  });

  it("the language question shows all three languages before one is chosen", () => {
    const r = render({ type: "language" }, "en");
    if (r.kind !== "interactive" || r.interactive.type !== "button") throw new Error("expected buttons");
    expect(r.interactive.buttons.map((b) => b.title)).toEqual(["English", "தமிழ்", "తెలుగు"]);
    expect(r.interactive.body.split("\n")).toEqual([en.welcome, ta.welcome, te.welcome]);
  });

  it("the group list has exactly 10 rows (Meta maximum) including Bombay and Not sure", () => {
    const r = render(question("group"), "te");
    if (r.kind !== "interactive" || r.interactive.type !== "list") throw new Error("expected list");
    expect(r.interactive.rows.map((x) => x.title)).toEqual(["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-", te.bombay, te.notSure]);
  });

  it("the done message includes the name and the command list", () => {
    const r = render({ type: "text", key: "done", params: { name: "Asha" } }, "en");
    if (r.kind !== "text") throw new Error("expected text");
    expect(r.text).toContain("Thank you, Asha.");
    expect(r.text).toContain("PAUSE 30");
  });
});

describe("message templates (PRD 9.3)", () => {
  it.each(LANGS.flatMap((lang) => TEMPLATE_NAMES.map((name) => [lang, name] as const)))("%s %s follows Meta rules", (lang, name) => {
    const t = COPIES[lang].templates[name];
    const def = TEMPLATE_DEFS[name];
    const vars = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    expect(vars.sort((a, b) => a - b)).toEqual(def.params.map((_, i) => i + 1)); // each variable exactly once
    expect(t.body.trim().startsWith("{{")).toBe(false); // Meta rejects a body that starts or ends with a variable
    expect(t.body.trim().endsWith("}}")).toBe(false);
    expect(t.body.length).toBeLessThanOrEqual(1024);
    expect(t.body).not.toMatch(/https?:|www\./);
    expect(t.buttons).toHaveLength(def.buttons);
    for (const b of t.buttons) expect(b.length).toBeLessThanOrEqual(25);
  });

  it("TEMPLATES.md is up to date (run npm run templates:md)", () => {
    expect(readFileSync("TEMPLATES.md", "utf8")).toBe(renderTemplatesMarkdown({ en, ta, te }));
  });
});
