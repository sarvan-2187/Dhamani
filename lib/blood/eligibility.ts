// PRD section 6.5: donor eligibility for an alert. All must hold. Pre-screen only; the blood centre decides.

export type Sex = "male" | "female" | "other";
export type TrustLevel = "unverified" | "slip_verified" | "coordinator_verified";

export type EligibilityDonor = {
  dob: string; // YYYY-MM-DD
  sex: Sex;
  weightBand: "45_54" | "55_plus" | null;
  lastDonatedOn: string | null; // YYYY-MM-DD
  pausedUntil: Date | null;
  stoppedAt: Date | null;
  nightOk: boolean;
  radiusKm: number;
};

export type EligibilityContext = {
  now: Date;
  wave: 1 | 2 | 3;
  waveRadiusKm: number;
  distanceKm: number; // donor home to hospital, from PostGIS
  alertsLast7d: number;
  alertsLast30d: number;
  alreadyAlerted: boolean; // for this request
  request: { isCritical: boolean; trustLevel: TrustLevel };
};

export type IneligibleReason =
  | "stopped"
  | "age"
  | "weight"
  | "donation_interval"
  | "paused"
  | "alert_cap_7d"
  | "alert_cap_30d"
  | "already_alerted"
  | "quiet_hours"
  | "distance";

export const MIN_AGE = 18;
export const MAX_AGE = 65; // inclusive: eligible until the 66th birthday
export const DONATION_INTERVAL_DAYS: Record<Sex, number> = { male: 90, female: 120, other: 120 };

const IST_OFFSET_MS = 330 * 60_000; // UTC+5:30, no daylight saving
const DAY_MS = 86_400_000;

/** Calendar date and hour in India for an instant. */
export function istParts(at: Date) {
  const d = new Date(at.getTime() + IST_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours() };
}

function parseDate(s: string) {
  const [y, m, day] = s.split("-").map(Number);
  return { y, m, day };
}

/** Completed years on the IST calendar date of `at`. */
export function ageOn(dob: string, at: Date): number {
  const b = parseDate(dob);
  const t = istParts(at);
  return t.y - b.y - (t.m < b.m || (t.m === b.m && t.day < b.day) ? 1 : 0);
}

/** Whole days from date `from` to the IST calendar date of `at`. */
export function daysSince(from: string, at: Date): number {
  const f = parseDate(from);
  const t = istParts(at);
  return Math.round((Date.UTC(t.y, t.m - 1, t.day) - Date.UTC(f.y, f.m - 1, f.day)) / DAY_MS);
}

/** 23:00 up to (not including) 06:00 IST. */
export function isQuietHours(at: Date): boolean {
  const { hour } = istParts(at);
  return hour >= 23 || hour < 6;
}

/** Returns why the donor cannot be alerted now, or null if every 6.5 rule holds. */
export function eligibilityProblem(d: EligibilityDonor, ctx: EligibilityContext): IneligibleReason | null {
  if (d.stoppedAt) return "stopped";

  const age = ageOn(d.dob, ctx.now);
  if (age < MIN_AGE || age > MAX_AGE) return "age";

  if (!d.weightBand) return "weight";

  if (d.lastDonatedOn && daysSince(d.lastDonatedOn, ctx.now) < DONATION_INTERVAL_DAYS[d.sex]) return "donation_interval";

  if (d.pausedUntil && d.pausedUntil.getTime() > ctx.now.getTime()) return "paused";

  if (ctx.alertsLast7d >= 2) return "alert_cap_7d";
  if (ctx.alertsLast30d >= 6) return "alert_cap_30d";

  if (ctx.alreadyAlerted) return "already_alerted";

  if (isQuietHours(ctx.now)) {
    const nightException = ctx.request.isCritical && d.nightOk && ctx.request.trustLevel === "coordinator_verified";
    if (!nightException) return "quiet_hours";
  }

  // Wave 3 ignores the donor's own radius but still uses the 40 km wave radius.
  const limitKm = ctx.wave === 3 ? ctx.waveRadiusKm : Math.min(ctx.waveRadiusKm, d.radiusKm);
  if (ctx.distanceKm > limitKm) return "distance";

  return null;
}
