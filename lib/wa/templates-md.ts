// Renders TEMPLATES.md (what to paste into WhatsApp Manager) from the template copy. Pure: callers pass the copy,
// so this runs both under Next/Vitest and from the plain Node script (scripts/templates-md.ts).
import { PAYLOADS, SAMPLES, TEMPLATE_DEFS, TEMPLATE_NAMES } from "./templates.ts";

type Copy = { templates: Record<string, { body: string; buttons: string[] }> };
const LANG_NAMES = { en: "English (en)", ta: "Tamil (ta)", te: "Telugu (te)" } as const;

export function renderTemplatesMarkdown(copies: Record<keyof typeof LANG_NAMES, Copy>): string {
  const out: string[] = [
    "# WhatsApp message templates",
    "",
    "Generated from `messages/wa/*.json` by `npm run templates:md`. Do not edit by hand.",
    "",
    "Submit each in WhatsApp Manager > Message templates > Create template:",
    "Category **Utility**, the name below, and add all three languages (English `en`, Tamil `ta`, Telugu `te`).",
    "Body text and buttons exactly as below. Buttons are **Quick reply** (the payload is set when sending).",
    "No header, no footer, no links, no emoji.",
    "",
  ];
  for (const name of TEMPLATE_NAMES) {
    const def = TEMPLATE_DEFS[name];
    out.push(`## \`${name}\``, "");
    out.push("| Variable | Meaning | Sample for review |", "| --- | --- | --- |");
    def.params.forEach((p, i) => out.push(`| \`{{${i + 1}}}\` | ${p} | ${SAMPLES[p]} |`));
    out.push("", `Quick reply payloads, in order: ${PAYLOADS[name]("<request_id>").map((x) => `\`${x}\``).join(", ")}`, "");
    for (const lang of ["en", "ta", "te"] as const) {
      const t = copies[lang].templates[name];
      out.push(`### ${LANG_NAMES[lang]}`, "", "Body:", "", "```", t.body, "```", "", `Buttons: ${t.buttons.map((b) => `\`${b}\``).join(" | ")}`, "");
    }
  }
  return out.join("\n");
}
