// PRD 9.3 / 9.5: button replies to alerts, status pings and follow-ups. Pure parsing; respond.ts acts on them.
import type { Inbound } from "../types";

export type AlertAction =
  | { kind: "donate" | "not_now" | "still_needed" | "fulfilled" | "cancel"; requestId: string }
  | { kind: "prescreen"; clear: boolean; requestId: string }
  | { kind: "eta"; bucket: "lt30" | "30to60" | "gt60"; requestId: string }
  | { kind: "donated"; yes: boolean; requestId: string }
  | { kind: "keep_on" };

const UUID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";
const SIMPLE: Record<string, "donate" | "not_now" | "still_needed" | "fulfilled" | "cancel"> = {
  DONATE: "donate",
  NOT_NOW: "not_now",
  STILL_NEEDED: "still_needed",
  FULFILLED: "fulfilled",
  CANCEL: "cancel",
};

export function parseAlertReply(m: Inbound): AlertAction | null {
  if (m.kind !== "reply") return null;
  const id = m.replyId ?? "";
  if (id === "KEEP_ON") return { kind: "keep_on" };
  let x = new RegExp(`^(DONATE|NOT_NOW|STILL_NEEDED|FULFILLED|CANCEL):${UUID}$`).exec(id);
  if (x) return { kind: SIMPLE[x[1]], requestId: x[2] };
  // The deferral answer itself is never stored (PRD 2, 6.6): only "deferred" on the alert.
  x = new RegExp(`^PRE:(clear|one):${UUID}$`).exec(id);
  if (x) return { kind: "prescreen", clear: x[1] === "clear", requestId: x[2] };
  x = new RegExp(`^ETA:(lt30|30to60|gt60):${UUID}$`).exec(id);
  if (x) return { kind: "eta", bucket: x[1] as "lt30" | "30to60" | "gt60", requestId: x[2] };
  x = new RegExp(`^DONATED_(YES|NO):${UUID}$`).exec(id);
  if (x) return { kind: "donated", yes: x[1] === "YES", requestId: x[2] };
  return null;
}
