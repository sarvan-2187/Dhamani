// PRD 9.6 commands: JOIN, HELP, STOP, UPDATE, STATUS, PAUSE <days>. Pure: returns replies and effects.
// STATUS sends a summary and, through the me_link effect, the signed /me link (PRD 8.2).
import { parseLoginMessage } from "../../auth/login";
import { DONATION_INTERVAL_DAYS } from "../../blood/eligibility";
import { formatDate, waTranslator } from "../i18n";
import type { Inbound, Lang } from "../types";
import { istToday, startJoin, startUpdate, type OnbState } from "./onboarding";
import type { DonorView, Outcome } from "./router";

export type Command =
  | { name: "HELP" | "STOP" | "UPDATE" | "STATUS" }
  | { name: "JOIN"; ref?: string } // "JOIN R7K2QX" from a donor's invite link
  | { name: "RECOG"; yes: boolean } // answer to a coordinator's "may we thank you publicly?"
  | { name: "PAUSE"; days: number | null }
  | { name: "LOGIN"; code: string };

export const MAX_PAUSE_DAYS = 365;
const DAY_MS = 86_400_000;

export function parseCommand(m: Inbound): Command | null {
  if (m.kind === "reply") {
    const id = m.replyId ?? "";
    if (id === "PAUSE") return { name: "PAUSE", days: null }; // "Pause alerts" on an alert: offer 7/30/90
    if (id === "PAUSE_30") return { name: "PAUSE", days: 30 }; // eligible_again template
    if (id === "RECOG:YES" || id === "RECOG:NO") return { name: "RECOG", yes: id === "RECOG:YES" };
    const p = /^CMD:PAUSE:(\d+)$/.exec(id);
    return p ? { name: "PAUSE", days: Number(p[1]) } : null;
  }
  if (m.kind !== "text") return null;
  const login = parseLoginMessage(m.text ?? "");
  if (login) return { name: "LOGIN", code: login };
  const t = (m.text ?? "").trim().toUpperCase();
  // Also the QR's prefilled text ("JOIN Dhamani") and invite links ("JOIN R7K2QX").
  if (/^JOIN\b/.test(t)) return { name: "JOIN", ref: /^JOIN\s+(R[A-Z0-9]{5})$/.exec(t)?.[1] };
  const c = /^(HELP|STOP|UPDATE|STATUS)$/.exec(t)?.[1] as "HELP" | "STOP" | "UPDATE" | "STATUS" | undefined;
  if (c) return { name: c };
  const p = /^PAUSE(?:\s+(\S+))?$/.exec(t);
  if (p) return { name: "PAUSE", days: p[1] === undefined ? null : /^\d+$/.test(p[1]) ? Number(p[1]) : NaN };
  return null;
}

type Ctx = { active: DonorView | null; flowState: OnbState | null; lang: Lang; now: Date };

const text = (key: string, params?: Record<string, string>) => ({ type: "text" as const, key, params });

/** "From <date>" once the 90/120 day interval since the last donation ends; the blood centre decides. */
function nextDonation(d: DonorView, lang: Lang, now: Date): string {
  const t = waTranslator(lang) as unknown as (k: string, p?: Record<string, string>) => string;
  if (!d.lastDonatedOn) return t("nextNow");
  const next = new Date(`${d.lastDonatedOn}T00:00:00+05:30`);
  next.setTime(next.getTime() + DONATION_INTERVAL_DAYS[d.sex] * DAY_MS);
  return next.getTime() <= new Date(`${istToday(now)}T00:00:00+05:30`).getTime()
    ? t("nextNow")
    : t("nextFrom", { date: formatDate(next, lang) });
}

export function handleCommand(cmd: Command, { active, lang, now }: Ctx): Outcome {
  const keep = (key: string, params?: Record<string, string>): Outcome => ({
    lang,
    replies: [text(key, params)],
    effects: [],
    conv: "keep",
  });

  switch (cmd.name) {
    case "HELP":
      return keep("help");
    case "LOGIN":
      // Works for anyone (families need not be donors). The handler checks the code and picks the reply.
      return { lang, replies: [], effects: [{ type: "login", code: cmd.code }], conv: "keep" };
    case "JOIN": {
      if (active) return keep("alreadyRegistered");
      const r = startJoin(cmd.ref);
      return { lang, replies: r.replies, effects: [], conv: r.state };
    }
    case "RECOG":
      return { lang, replies: [text(cmd.yes ? "recognitionYesThanks" : "recognitionNoThanks")], effects: [{ type: "recognition", yes: cmd.yes }], conv: "keep" };
    case "UPDATE": {
      if (!active) return keep("notRegistered");
      const r = startUpdate({ lang: active.lang, name: active.name, consentVersion: active.consentVersion });
      return { lang, replies: r.replies, effects: [], conv: r.state };
    }
    case "STATUS": {
      if (!active) return keep("notRegistered");
      const t = waTranslator(lang) as unknown as (k: string, p?: Record<string, string>) => string;
      const paused = active.pausedUntil && active.pausedUntil.getTime() > now.getTime();
      return {
        ...keep("status", {
          name: active.name,
          group: active.group === "bombay" ? t("bombay") : active.group,
          alerts: paused ? t("alertsPausedUntil", { date: formatDate(active.pausedUntil!, lang) }) : t("alertsOn"),
          next: nextDonation(active, lang, now),
        }),
        effects: [{ type: "me_link" }],
      };
    }
    case "PAUSE": {
      if (!active) return keep("notRegistered");
      if (cmd.days === null) {
        return {
          lang,
          replies: [
            {
              type: "buttons",
              key: "pauseAsk",
              buttons: [
                { id: "CMD:PAUSE:7", label: "buttons.days7" },
                { id: "CMD:PAUSE:30", label: "buttons.days30" },
                { id: "CMD:PAUSE:90", label: "buttons.days90" },
              ],
            },
          ],
          effects: [],
          conv: "keep",
        };
      }
      if (!Number.isInteger(cmd.days) || cmd.days < 1 || cmd.days > MAX_PAUSE_DAYS) return keep("pauseInvalid");
      const until = new Date(now.getTime() + cmd.days * DAY_MS);
      return { lang, replies: [text("paused", { date: formatDate(until, lang) })], effects: [{ type: "pause", until }], conv: "keep" };
    }
    case "STOP":
      return active
        ? { lang, replies: [text("stopped")], effects: [{ type: "stop" }], conv: null }
        : { lang, replies: [text("cancelled")], effects: [], conv: null };
  }
}
