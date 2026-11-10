// Language-agnostic replies produced by the flows, rendered into WhatsApp messages per donor language.
import { LANGS, WA_MESSAGES, waTranslator } from "../i18n";
import type { Interactive, Lang } from "../types";

export type Reply =
  | { type: "text"; key: string; params?: Record<string, string> }
  | { type: "buttons"; key: string; params?: Record<string, string>; buttons: { id: string; label: string }[] }
  | { type: "list"; key: string; buttonLabel: string; rows: { id: string; label: string; raw?: boolean }[] }
  | { type: "language" };

export type Rendered = { kind: "text"; text: string } | { kind: "interactive"; interactive: Interactive };

type T = (key: string, params?: Record<string, string>) => string;

export function render(r: Reply, lang: Lang): Rendered {
  const t = waTranslator(lang) as unknown as T;
  // `help` is available to every message (the "done" message embeds the command list).
  const params = (p?: Record<string, string>) => ({ help: t("help"), ...p });
  switch (r.type) {
    case "text":
      return { kind: "text", text: t(r.key, params(r.params)) };
    case "buttons":
      return {
        kind: "interactive",
        interactive: { type: "button", body: t(r.key, params(r.params)), buttons: r.buttons.map((b) => ({ id: b.id, title: t(b.label) })) },
      };
    case "list":
      return {
        kind: "interactive",
        interactive: {
          type: "list",
          body: t(r.key),
          buttonLabel: t(r.buttonLabel),
          rows: r.rows.map((row) => ({ id: row.id, title: row.raw ? row.label : t(row.label) })),
        },
      };
    case "language":
      // Before a language is chosen: one line per language, buttons in each language's own script.
      return {
        kind: "interactive",
        interactive: {
          type: "button",
          body: LANGS.map((l) => WA_MESSAGES[l].welcome).join("\n"),
          buttons: LANGS.map((l) => ({ id: `ONB:LANG:${l}`, title: WA_MESSAGES.en.languageNames[l] })),
        },
      };
  }
}
