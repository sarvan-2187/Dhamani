// Decides what one inbound message means: a command, the next onboarding answer, or neither. Pure.
// Alert, status and follow-up buttons become an "alert" effect that the handler resolves against the DB.
import type { BloodGroup } from "../../blood/compat";
import { CERT_NAME_RE } from "../../recognition/rules";
import type { Sex } from "../../blood/eligibility";
import type { Inbound, Lang } from "../types";
import { parseAlertReply, type AlertAction } from "./alerts";
import { handleCommand, parseCommand } from "./commands";
import { onboardingStep, type DonorInput, type OnbState } from "./onboarding";
import type { Reply } from "./reply";

export type DonorView = {
  name: string;
  lang: Lang;
  group: BloodGroup;
  sex: Sex;
  lastDonatedOn: string | null;
  pausedUntil: Date | null;
  stoppedAt: Date | null;
  consentVersion: string;
  isSynthetic: boolean;
};

export type ConvView = { flow: string | null; step: string | null; data: unknown } | null;

export type Effect =
  | { type: "save_donor"; donor: DonorInput }
  | { type: "pause"; until: Date }
  | { type: "stop" }
  | { type: "login"; code: string } // reverse OTP (PRD 8.1): the handler confirms it and replies
  | { type: "alert"; action: AlertAction } // alert, status ping and follow-up buttons (PRD 9.5): handled with the DB
  | { type: "me_link" } // STATUS (PRD 9.6): the handler signs the /me link and resends pending certificates
  | { type: "cert_name"; name: string } // English spelling for certificates (M8), then the certificates go out
  | { type: "recognition"; yes: boolean }; // may coordinators thank this referrer publicly (owner request 2026-11-10)

/** conv: the onboarding state to store, null to clear it, "keep" to leave it as it is. */
export type Outcome = { lang: Lang; replies: Reply[]; effects: Effect[]; conv: OnbState | null | "keep" };

export function route(m: Inbound, conv: ConvView, donor: DonorView | null, now: Date): Outcome {
  const flowState = conv?.flow === "onboarding" && conv.step ? ({ step: conv.step, data: conv.data } as OnbState) : null;
  const active = donor && !donor.stoppedAt ? donor : null;
  const lang: Lang = active?.lang ?? flowState?.data.lang ?? "en";

  const alert = parseAlertReply(m);
  if (alert) return { lang, replies: [], effects: [{ type: "alert", action: alert }], conv: "keep" };

  const cmd = parseCommand(m);
  if (cmd) return handleCommand(cmd, { active, flowState, lang, now });

  // After a verified donation, a donor whose name is not in English letters is asked how to print it (M8).
  if (conv?.flow === "cert_name") {
    const name = m.kind === "text" ? (m.text ?? "").trim().replace(/\s+/g, " ") : "";
    return CERT_NAME_RE.test(name)
      ? { lang, replies: [], effects: [{ type: "cert_name", name }], conv: null }
      : { lang, replies: [{ type: "text", key: "certNameInvalid" }], effects: [], conv: "keep" };
  }

  if (flowState) {
    const r = onboardingStep(flowState, m, now);
    return {
      // Reply in the language just chosen, once there is one.
      lang: r.save?.lang ?? r.state?.data.lang ?? lang,
      replies: r.replies,
      effects: r.save ? [{ type: "save_donor", donor: r.save }] : [],
      conv: r.state,
    };
  }

  return { lang, replies: [{ type: "text", key: active ? "unknown" : "notRegistered" }], effects: [], conv: "keep" };
}
