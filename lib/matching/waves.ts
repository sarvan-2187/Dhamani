// PRD section 7.2 and the 7.3 expiry formula. Pure: the caller loads candidates (with PostGIS distance) and persists.
import { isCompatible, isRhNegativeOrBombay, type BloodGroup, type Component } from "../blood/compat";
import { eligibilityProblem, type EligibilityDonor, type TrustLevel } from "../blood/eligibility";
import { score } from "./score";

export type Wave = 1 | 2 | 3;

export const WAVES: Record<Wave, { radiusKm: number; count: number; nextCheckMin: number | null }> = {
  1: { radiusKm: 5, count: 10, nextCheckMin: 20 },
  2: { radiusKm: 15, count: 25, nextCheckMin: 30 },
  3: { radiusKm: 40, count: 50, nextCheckMin: null }, // then escalated = true
};

const MIN = 60_000;
const HOUR = 60 * MIN;

/** target = ceil(units * 1.5) confirmations. */
export const targetConfirmations = (units: number) => Math.ceil(units * 1.5);
export const isTargetReached = (units: number, confirmed: number) => confirmed >= targetConfirmations(units);

/** expires_at = min(needed_by + 2 h, created_at + 72 h). */
export const expiresAt = (neededBy: Date, createdAt: Date) =>
  new Date(Math.min(neededBy.getTime() + 2 * HOUR, createdAt.getTime() + 72 * HOUR));

export type RequestStatus = "open" | "fulfilled" | "expired" | "cancelled" | "frozen" | "held";

export type MatchRequest = {
  group: BloodGroup;
  component: Component;
  isCritical: boolean;
  trustLevel: TrustLevel;
  status: RequestStatus;
};

export type Candidate = EligibilityDonor & {
  id: string;
  group: BloodGroup;
  rareRegistryOptIn: boolean;
  responsiveness: number;
  lastAlertedAt: Date | null;
  distanceKm: number;
  alertsLast7d: number;
  alertsLast30d: number;
  alreadyAlerted: boolean;
};

/**
 * Rare registry donors: only wave 3 and only coordinator_verified requests,
 * unless the request is Rh-negative or Bombay, where they join from wave 1.
 */
export function rareRegistryAllowed(wave: Wave, req: Pick<MatchRequest, "group" | "trustLevel">): boolean {
  return isRhNegativeOrBombay(req.group) || (wave === 3 && req.trustLevel === "coordinator_verified");
}

/** Donors to alert in `wave`, best first. Empty if the request is not open, or unverified past wave 1. */
export function selectDonors(candidates: Candidate[], req: MatchRequest, wave: Wave, now: Date) {
  if (req.status !== "open") return [];
  if (req.trustLevel === "unverified" && wave > 1) return [];
  const w = WAVES[wave];

  return candidates
    .filter((c) => isCompatible(req.component, req.group, c.group))
    .filter((c) => !c.rareRegistryOptIn || rareRegistryAllowed(wave, req))
    .filter(
      (c) =>
        eligibilityProblem(c, {
          now,
          wave,
          waveRadiusKm: w.radiusKm,
          distanceKm: c.distanceKm,
          alertsLast7d: c.alertsLast7d,
          alertsLast30d: c.alertsLast30d,
          alreadyAlerted: c.alreadyAlerted,
          request: req,
        }) === null,
    )
    .map((c) => ({
      id: c.id,
      score: score({
        distanceKm: c.distanceKm,
        waveRadiusKm: w.radiusKm,
        responsiveness: c.responsiveness,
        lastAlertedAt: c.lastAlertedAt,
        donorGroup: c.group,
        patientGroup: req.group,
        now,
      }),
    }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
    .slice(0, w.count);
}

export type CheckDecision =
  | { action: "none" }
  | { action: "fulfil" }
  | { action: "expire" }
  | { action: "stop" } // unverified: no waves after 1; clear next_check_at
  | { action: "send_wave"; wave: Wave; nextCheckAt: Date | null; escalate: boolean };

/** What the tick (or posting, at current_wave 0) should do for one request. */
export function planCheck(
  req: { status: RequestStatus; currentWave: 0 | Wave; trustLevel: TrustLevel; units: number; expiresAt: Date },
  confirmed: number,
  now: Date,
): CheckDecision {
  if (req.status !== "open") return { action: "none" };
  if (isTargetReached(req.units, confirmed)) return { action: "fulfil" };
  if (now.getTime() > req.expiresAt.getTime()) return { action: "expire" };
  if (req.currentWave === 3) return { action: "none" }; // already escalated
  if (req.currentWave === 1 && req.trustLevel === "unverified") return { action: "stop" };

  const wave = (req.currentWave + 1) as Wave;
  const mins = WAVES[wave].nextCheckMin;
  return {
    action: "send_wave",
    wave,
    nextCheckAt: mins === null ? null : new Date(now.getTime() + mins * MIN),
    escalate: wave === 3,
  };
}
