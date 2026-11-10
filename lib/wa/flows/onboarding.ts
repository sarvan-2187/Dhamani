// PRD 9.4: donor onboarding as a pure state machine. Input: current state + one inbound message.
// Output: next state (null = flow over), replies to send, and the donor row to save when complete.
import { ABO_RH_GROUPS, ALL_GROUPS, isRhNegativeOrBombay, type BloodGroup } from "../../blood/compat";
import { ageOn, istParts, MAX_AGE, MIN_AGE, type Sex } from "../../blood/eligibility";
import { roundCoord } from "../../geo";
import type { Inbound, Lang } from "../types";
import type { Reply } from "./reply";

export const CONSENT_VERSION = "2026-11-v1";

export type WeightBand = "45_54" | "55_plus";
export type OnbStep =
  | "lang"
  | "consent"
  | "name"
  | "group"
  | "dob"
  | "sex"
  | "weight"
  | "location"
  | "last_donation"
  | "radius"
  | "night"
  | "rare";

export type OnbData = {
  mode: "join" | "update";
  ref?: string; // referral code from "JOIN <code>"; links the new donor to who invited them
  lang?: Lang;
  consentVersion?: string;
  name?: string;
  group?: BloodGroup;
  dob?: string;
  sex?: Sex;
  weightBand?: WeightBand;
  lat?: number;
  lng?: number;
  lastDonatedOn?: string | null;
  radiusKm?: 5 | 10 | 20;
  nightOk?: boolean;
  rare?: boolean;
};

export type OnbState = { step: OnbStep; data: OnbData };

export type DonorInput = {
  lang: Lang;
  name: string;
  group: BloodGroup;
  dob: string;
  sex: Sex;
  weightBand: WeightBand;
  lat: number;
  lng: number;
  lastDonatedOn: string | null;
  radiusKm: 5 | 10 | 20;
  nightOk: boolean;
  rareRegistryOptIn: boolean;
  consentVersion: string;
  referralCode?: string;
};

export type StepResult = { state: OnbState | null; replies: Reply[]; save?: DonorInput };

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'-]{0,39}$/u;
const yesNo = (prefix: string) => [
  { id: `${prefix}:yes`, label: "buttons.yes" },
  { id: `${prefix}:no`, label: "buttons.no" },
];
const NEVER = [{ id: "ONB:LAST:never", label: "buttons.never" }];

/** The question asked at each step. */
export function question(step: OnbStep): Reply {
  switch (step) {
    case "lang":
      return { type: "language" };
    case "consent":
      return { type: "buttons", key: "consent", buttons: [{ id: "ONB:AGREE", label: "buttons.agree" }] };
    case "name":
      return { type: "text", key: "askName" };
    case "group":
      return {
        type: "list",
        key: "askGroup",
        buttonLabel: "groupButton",
        rows: [
          ...ABO_RH_GROUPS.map((g) => ({ id: `ONB:GROUP:${g}`, label: g, raw: true })),
          { id: "ONB:GROUP:bombay", label: "bombay" },
          { id: "ONB:GROUP:unsure", label: "notSure" },
        ],
      };
    case "dob":
      return { type: "text", key: "askDob" };
    case "sex":
      return {
        type: "buttons",
        key: "askSex",
        buttons: [
          { id: "ONB:SEX:male", label: "buttons.male" },
          { id: "ONB:SEX:female", label: "buttons.female" },
          { id: "ONB:SEX:other", label: "buttons.other" },
        ],
      };
    case "weight":
      return {
        type: "buttons",
        key: "askWeight",
        buttons: [
          { id: "ONB:WEIGHT:under45", label: "buttons.under45" },
          { id: "ONB:WEIGHT:45_54", label: "buttons.w45to54" },
          { id: "ONB:WEIGHT:55_plus", label: "buttons.w55plus" },
        ],
      };
    case "location":
      return { type: "text", key: "askLocation" };
    case "last_donation":
      return { type: "buttons", key: "askLastDonation", buttons: NEVER };
    case "radius":
      return {
        type: "buttons",
        key: "askRadius",
        buttons: [
          { id: "ONB:RADIUS:5", label: "buttons.km5" },
          { id: "ONB:RADIUS:10", label: "buttons.km10" },
          { id: "ONB:RADIUS:20", label: "buttons.km20" },
        ],
      };
    case "night":
      return { type: "buttons", key: "askNight", buttons: yesNo("ONB:NIGHT") };
    case "rare":
      return { type: "buttons", key: "askRare", buttons: yesNo("ONB:RARE") };
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "05-08-1995" (also / or .) to "1995-08-05"; null if not a real calendar date. */
export function parseDmy(text: string): string | null {
  const m = /^\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\s*$/.exec(text);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

export function istToday(now: Date): string {
  const t = istParts(now);
  return `${t.y}-${pad(t.m)}-${pad(t.day)}`;
}

export function startJoin(ref?: string): StepResult {
  return { state: { step: "lang", data: { mode: "join", ...(ref ? { ref } : {}) } }, replies: [question("lang")] };
}

/** UPDATE re-runs onboarding from the blood group step, keeping language, name and consent. */
export function startUpdate(existing: { lang: Lang; name: string; consentVersion: string }): StepResult {
  return { state: { step: "group", data: { mode: "update", ...existing } }, replies: [question("group")] };
}

export function onboardingStep(state: OnbState, m: Inbound, now: Date): StepResult {
  const { step, data } = state;
  const id = m.kind === "reply" ? (m.replyId ?? "") : "";
  const text = m.kind === "text" ? (m.text ?? "").trim() : "";

  const reask = (): StepResult => ({ state, replies: [question(step)] });
  const say = (key: string): StepResult => ({ state, replies: [{ type: "text", key }] });
  const end = (key: string): StepResult => ({ state: null, replies: [{ type: "text", key }] });
  const go = (next: OnbStep, d: OnbData): StepResult => ({ state: { step: next, data: d }, replies: [question(next)] });
  const finish = (d: OnbData): StepResult => ({
    state: null,
    replies: [{ type: "text", key: "done", params: { name: d.name! } }],
    save: {
      lang: d.lang!,
      name: d.name!,
      group: d.group!,
      dob: d.dob!,
      sex: d.sex!,
      weightBand: d.weightBand!,
      lat: d.lat!,
      lng: d.lng!,
      lastDonatedOn: d.lastDonatedOn ?? null,
      radiusKm: d.radiusKm!,
      nightOk: d.nightOk!,
      rareRegistryOptIn: d.rare ?? false,
      consentVersion: d.consentVersion!,
      ...(d.ref ? { referralCode: d.ref } : {}),
    },
  });

  switch (step) {
    case "lang": {
      const l = /^ONB:LANG:(en|ta|te)$/.exec(id)?.[1] as Lang | undefined;
      return l ? go("consent", { ...data, lang: l }) : reask();
    }
    case "consent":
      return id === "ONB:AGREE" ? go("name", { ...data, consentVersion: CONSENT_VERSION }) : reask();
    case "name":
      return NAME_RE.test(text) ? go("group", { ...data, name: text }) : say("nameInvalid");
    case "group": {
      const g = /^ONB:GROUP:(.+)$/.exec(id)?.[1];
      if (g === "unsure") return end("notSureEnd");
      return g && (ALL_GROUPS as readonly string[]).includes(g) ? go("dob", { ...data, group: g as BloodGroup }) : reask();
    }
    case "dob": {
      const dob = parseDmy(text);
      if (!dob) return say("dobInvalid");
      const age = ageOn(dob, now);
      return age < MIN_AGE || age > MAX_AGE ? end("ageEnd") : go("sex", { ...data, dob });
    }
    case "sex": {
      const s = /^ONB:SEX:(male|female|other)$/.exec(id)?.[1] as Sex | undefined;
      return s ? go("weight", { ...data, sex: s }) : reask();
    }
    case "weight": {
      const w = /^ONB:WEIGHT:(under45|45_54|55_plus)$/.exec(id)?.[1];
      if (w === "under45") return end("weightEnd");
      return w ? go("location", { ...data, weightBand: w as WeightBand }) : reask();
    }
    case "location":
      return m.kind === "location" && m.location
        ? go("last_donation", { ...data, lat: roundCoord(m.location.lat), lng: roundCoord(m.location.lng) })
        : say("locationInvalid");
    case "last_donation": {
      if (id === "ONB:LAST:never") return go("radius", { ...data, lastDonatedOn: null });
      const d = parseDmy(text);
      if (!d) return { state, replies: [{ type: "buttons", key: "lastDonationInvalid", buttons: NEVER }] };
      if (d > istToday(now)) return { state, replies: [{ type: "buttons", key: "lastDonationFuture", buttons: NEVER }] };
      return go("radius", { ...data, lastDonatedOn: d });
    }
    case "radius": {
      const r = /^ONB:RADIUS:(5|10|20)$/.exec(id)?.[1];
      return r ? go("night", { ...data, radiusKm: Number(r) as 5 | 10 | 20 }) : reask();
    }
    case "night": {
      const n = /^ONB:NIGHT:(yes|no)$/.exec(id)?.[1];
      if (!n) return reask();
      const d = { ...data, nightOk: n === "yes" };
      // 9.4 step 12: the rare registry question is only for Rh-negative or Bombay donors.
      return isRhNegativeOrBombay(d.group!) ? go("rare", d) : finish(d);
    }
    case "rare": {
      const r = /^ONB:RARE:(yes|no)$/.exec(id)?.[1];
      return r ? finish({ ...data, rare: r === "yes" }) : reask();
    }
  }
}
