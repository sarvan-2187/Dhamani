import { describe, expect, it } from "vitest";
import {
  ageOn,
  daysSince,
  eligibilityProblem,
  isQuietHours,
  type EligibilityContext,
  type EligibilityDonor,
} from "../../lib/blood/eligibility";

// 12:00 IST on 2026-11-10: outside quiet hours.
const NOON_IST = new Date("2026-11-10T12:00:00+05:30");
const at = (istTime: string) => new Date(`2026-11-10T${istTime}:00+05:30`);

const donor = (over: Partial<EligibilityDonor> = {}): EligibilityDonor => ({
  dob: "1995-01-01",
  sex: "male",
  weightBand: "55_plus",
  lastDonatedOn: null,
  pausedUntil: null,
  stoppedAt: null,
  nightOk: false,
  radiusKm: 10,
  ...over,
});

const ctx = (over: Partial<EligibilityContext> = {}): EligibilityContext => ({
  now: NOON_IST,
  wave: 1,
  waveRadiusKm: 5,
  distanceKm: 2,
  alertsLast7d: 0,
  alertsLast30d: 0,
  alreadyAlerted: false,
  request: { isCritical: false, trustLevel: "unverified" },
  ...over,
});

const problem = (d: Partial<EligibilityDonor> = {}, c: Partial<EligibilityContext> = {}) =>
  eligibilityProblem(donor(d), ctx(c));

it("a typical donor is eligible", () => {
  expect(problem()).toBeNull();
});

describe("age 18 to 65 on the day of the alert (IST)", () => {
  it.each([
    ["2008-11-11", "age", "one day before 18th birthday"],
    ["2008-11-10", null, "18th birthday"],
    ["1961-11-10", null, "65th birthday"],
    ["1960-11-11", null, "65, one day before 66th birthday"],
    ["1960-11-10", "age", "66th birthday"],
  ])("dob %s -> %s (%s)", (dob, expected, label) => {
    expect(problem({ dob }), label).toBe(expected);
  });

  it("uses the IST date, not UTC: 00:30 IST is already the next day", () => {
    // 2026-11-09T19:00Z = 2026-11-10 00:30 IST
    expect(ageOn("2008-11-10", new Date("2026-11-09T19:00:00Z"))).toBe(18);
  });
});

it("weight band must be present", () => {
  expect(problem({ weightBand: null })).toBe("weight");
  expect(problem({ weightBand: "45_54" })).toBeNull();
});

describe("days since last donation: 90 if male, else 120", () => {
  it.each([
    ["male", "2026-08-13", "donation_interval"], // 89 days
    ["male", "2026-08-12", null], // 90 days
    ["female", "2026-07-14", "donation_interval"], // 119 days
    ["female", "2026-07-13", null], // 120 days
    ["other", "2026-07-14", "donation_interval"], // other uses 120
    ["other", "2026-07-13", null],
  ] as const)("%s, last donated %s -> %s", (sex, lastDonatedOn, expected) => {
    expect(problem({ sex, lastDonatedOn })).toBe(expected);
  });

  it("never donated is fine", () => {
    expect(problem({ lastDonatedOn: null, sex: "female" })).toBeNull();
  });

  it("counts calendar days", () => {
    expect(daysSince("2026-08-12", NOON_IST)).toBe(90);
  });
});

describe("pause and stop", () => {
  it("paused until the future -> ineligible; in the past -> eligible", () => {
    expect(problem({ pausedUntil: new Date(NOON_IST.getTime() + 1000) })).toBe("paused");
    expect(problem({ pausedUntil: new Date(NOON_IST.getTime() - 1000) })).toBeNull();
  });

  it("stopped donors are never alerted", () => {
    expect(problem({ stoppedAt: new Date("2026-01-01") })).toBe("stopped");
  });
});

describe("alert caps: fewer than 2 in 7 days and fewer than 6 in 30 days", () => {
  it.each([
    [1, 1, null],
    [2, 2, "alert_cap_7d"],
    [1, 5, null],
    [1, 6, "alert_cap_30d"],
  ])("7d=%i 30d=%i -> %s", (alertsLast7d, alertsLast30d, expected) => {
    expect(problem({}, { alertsLast7d, alertsLast30d })).toBe(expected);
  });
});

it("not already alerted for this request", () => {
  expect(problem({}, { alreadyAlerted: true })).toBe("already_alerted");
});

describe("quiet hours 23:00 to 06:00 IST", () => {
  it.each([
    ["22:59", false],
    ["23:00", true],
    ["02:00", true],
    ["05:59", true],
    ["06:00", false],
  ])("%s quiet=%s", (t, quiet) => {
    expect(isQuietHours(at(t))).toBe(quiet);
    expect(problem({}, { now: at(t) })).toBe(quiet ? "quiet_hours" : null);
  });

  const night = { now: at("02:00") };
  const verifiedCritical = { isCritical: true, trustLevel: "coordinator_verified" as const };

  it("allowed only when critical AND night_ok AND coordinator_verified", () => {
    expect(problem({ nightOk: true }, { ...night, request: verifiedCritical })).toBeNull();
  });

  it.each([
    ["not critical", { nightOk: true }, { isCritical: false, trustLevel: "coordinator_verified" as const }],
    ["donor not night_ok", { nightOk: false }, verifiedCritical],
    ["only slip_verified", { nightOk: true }, { isCritical: true, trustLevel: "slip_verified" as const }],
  ])("still skipped when %s", (_, d, request) => {
    expect(problem(d, { ...night, request })).toBe("quiet_hours");
  });
});

describe("distance <= min(wave radius, donor radius); wave 3 ignores the donor radius", () => {
  it.each([
    [1, 5, 10, 5, null], // at the wave 1 limit
    [1, 5, 10, 5.1, "distance"],
    [2, 15, 5, 5, null], // donor radius 5 caps wave 2
    [2, 15, 5, 6, "distance"],
    [2, 15, 20, 15, null],
    [2, 15, 20, 15.5, "distance"],
    [3, 40, 5, 39, null], // wave 3 ignores donor radius
    [3, 40, 20, 40, null],
    [3, 40, 20, 40.1, "distance"], // but not the 40 km wave radius
  ] as const)("wave %i (radius %i), donor radius %i, %f km -> %s", (wave, waveRadiusKm, radiusKm, distanceKm, expected) => {
    expect(problem({ radiusKm }, { wave, waveRadiusKm, distanceKm })).toBe(expected);
  });
});
