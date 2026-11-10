// PRD 9.3: Utility templates (one name, three languages). The text lives in messages/wa/*.json under
// `templates` and is submitted to Meta from TEMPLATES.md; here: names, parameter order, button payloads.
import type { Lang, TemplateMessage } from "./types";

export const TEMPLATE_DEFS = {
  request_alert: {
    params: ["group", "component", "hospital", "area", "needed_by", "distance_km", "request_code"],
    buttons: 3,
  },
  request_followup: { params: ["hospital", "request_code"], buttons: 2 },
  request_status: { params: ["request_code", "confirmed_count"], buttons: 3 },
  eligible_again: { params: ["date"], buttons: 2 },
} as const;

export type TemplateName = keyof typeof TEMPLATE_DEFS;
export const TEMPLATE_NAMES = Object.keys(TEMPLATE_DEFS) as TemplateName[];

/** Quick reply payloads, in button order. */
export const PAYLOADS = {
  request_alert: (requestId: string) => [`DONATE:${requestId}`, `NOT_NOW:${requestId}`, "PAUSE"],
  request_followup: (requestId: string) => [`DONATED_YES:${requestId}`, `DONATED_NO:${requestId}`],
  request_status: (requestId: string) => [`STILL_NEEDED:${requestId}`, `FULFILLED:${requestId}`, `CANCEL:${requestId}`],
  eligible_again: () => ["KEEP_ON", "PAUSE_30"],
} satisfies Record<TemplateName, (requestId: string) => string[]>;

/** Example values Meta asks for when reviewing a template (synthetic, DEV ONLY hospital). */
export const SAMPLES: Record<string, string> = {
  group: "O+",
  component: "Whole blood",
  hospital: "DEV ONLY Test Hospital A",
  area: "Chennai",
  needed_by: "10 Nov, 6:00 pm",
  distance_km: "3",
  request_code: "DH-7Q4K",
  confirmed_count: "2",
  date: "12 Nov 2026",
};

export function buildTemplate<N extends TemplateName>(
  name: N,
  lang: Lang,
  values: Record<(typeof TEMPLATE_DEFS)[N]["params"][number], string>,
  quickReplyPayloads: string[],
): TemplateMessage {
  const def = TEMPLATE_DEFS[name];
  if (quickReplyPayloads.length !== def.buttons) throw new Error(`${name} needs ${def.buttons} button payloads`);
  const v = values as Record<string, string>;
  return { name, lang, bodyParams: def.params.map((p) => v[p]), quickReplyPayloads };
}
