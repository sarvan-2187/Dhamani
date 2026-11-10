// PRD section 7.1: ranking score, higher first.
import type { BloodGroup } from "../blood/compat";

export const WEIGHTS = { proximity: 0.45, responsiveness: 0.25, rest: 0.2, exactGroup: 0.1 } as const;
const DAY_MS = 86_400_000;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export type ScoreInput = {
  distanceKm: number;
  waveRadiusKm: number;
  responsiveness: number; // 0..1, new donors 0.5
  lastAlertedAt: Date | null;
  donorGroup: BloodGroup;
  patientGroup: BloodGroup;
  now: Date;
};

export function scoreParts(i: ScoreInput) {
  return {
    proximity: clamp01(1 - i.distanceKm / i.waveRadiusKm),
    responsiveness: clamp01(i.responsiveness),
    rest: i.lastAlertedAt ? Math.min((i.now.getTime() - i.lastAlertedAt.getTime()) / DAY_MS, 30) / 30 : 1,
    exactGroup: i.donorGroup === i.patientGroup ? 1 : 0, // "both Bombay" is the same group
  };
}

export function score(i: ScoreInput): number {
  const p = scoreParts(i);
  return (
    WEIGHTS.proximity * p.proximity +
    WEIGHTS.responsiveness * p.responsiveness +
    WEIGHTS.rest * p.rest +
    WEIGHTS.exactGroup * p.exactGroup
  );
}

export const RESPONSIVENESS_ALPHA = 0.2;
export const RESPONSE_WINDOW_MS = 30 * 60_000;

/** EMA (alpha 0.2) of "responded with any button within 30 min" for one alert. */
export function updateResponsiveness(previous: number, respondedWithin30Min: boolean): number {
  return (1 - RESPONSIVENESS_ALPHA) * previous + RESPONSIVENESS_ALPHA * (respondedWithin30Min ? 1 : 0);
}
