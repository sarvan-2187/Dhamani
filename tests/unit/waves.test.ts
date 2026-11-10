import { describe, expect, it } from "vitest";
import {
  WAVES,
  expiresAt,
  isTargetReached,
  planCheck,
  rareRegistryAllowed,
  selectDonors,
  targetConfirmations,
  type Candidate,
  type MatchRequest,
} from "../../lib/matching/waves";

const NOW = new Date("2026-11-10T12:00:00+05:30");
const H = 3_600_000;

const cand = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  id,
  group: "O+",
  dob: "1995-01-01",
  sex: "male",
  weightBand: "55_plus",
  lastDonatedOn: null,
  pausedUntil: null,
  stoppedAt: null,
  nightOk: false,
  radiusKm: 20,
  rareRegistryOptIn: false,
  responsiveness: 0.5,
  lastAlertedAt: null,
  distanceKm: 1,
  alertsLast7d: 0,
  alertsLast30d: 0,
  alreadyAlerted: false,
  ...over,
});

const req = (over: Partial<MatchRequest> = {}): MatchRequest => ({
  group: "O+",
  component: "whole_blood",
  isCritical: false,
  trustLevel: "slip_verified",
  status: "open",
  ...over,
});

const ids = (r: { id: string }[]) => r.map((x) => x.id);

describe("waves table (7.2)", () => {
  it("matches the PRD", () => {
    expect(WAVES).toEqual({
      1: { radiusKm: 5, count: 10, nextCheckMin: 20 },
      2: { radiusKm: 15, count: 25, nextCheckMin: 30 },
      3: { radiusKm: 40, count: 50, nextCheckMin: null },
    });
  });
});

describe("target = ceil(units * 1.5)", () => {
  it.each([
    [1, 2], [2, 3], [3, 5], [4, 6], [5, 8], [6, 9], [7, 11], [8, 12], [9, 14], [10, 15],
  ])("%i units -> %i confirmations", (units, target) => {
    expect(targetConfirmations(units)).toBe(target);
    expect(isTargetReached(units, target - 1)).toBe(false);
    expect(isTargetReached(units, target)).toBe(true);
  });
});

describe("expires_at = min(needed_by + 2 h, created_at + 72 h)", () => {
  it("needed soon: needed_by + 2 h", () => {
    expect(expiresAt(new Date(NOW.getTime() + 5 * H), NOW)).toEqual(new Date(NOW.getTime() + 7 * H));
  });
  it("needed far ahead: capped at created_at + 72 h", () => {
    expect(expiresAt(new Date(NOW.getTime() + 100 * H), NOW)).toEqual(new Date(NOW.getTime() + 72 * H));
  });
});

describe("selectDonors", () => {
  it("demo step 2: an O+ whole blood request alerts O+ and O- donors, never B+", () => {
    const picked = selectDonors([cand("o+", { group: "O+" }), cand("o-", { group: "O-" }), cand("b+", { group: "B+" })], req(), 1, NOW);
    expect(ids(picked).sort()).toEqual(["o+", "o-"]);
  });

  it("never alerts a Bombay donor for a non-Bombay patient", () => {
    expect(selectDonors([cand("bom", { group: "bombay" })], req(), 3, NOW)).toEqual([]);
  });

  it("takes the top 10 in wave 1, best score first", () => {
    const pool = Array.from({ length: 15 }, (_, i) => cand(`d${String(i).padStart(2, "0")}`, { distanceKm: 4.5 - i * 0.3 }));
    const picked = selectDonors(pool, req(), 1, NOW);
    expect(picked).toHaveLength(10);
    expect(ids(picked)).toEqual(["d14", "d13", "d12", "d11", "d10", "d09", "d08", "d07", "d06", "d05"]);
    for (let i = 1; i < picked.length; i++) expect(picked[i - 1].score).toBeGreaterThanOrEqual(picked[i].score);
  });

  it("takes up to 25 in wave 2 and 50 in wave 3", () => {
    const pool = Array.from({ length: 60 }, (_, i) => cand(`d${i}`, { distanceKm: 3 }));
    expect(selectDonors(pool, req(), 2, NOW)).toHaveLength(25);
    expect(selectDonors(pool, req({ trustLevel: "coordinator_verified" }), 3, NOW)).toHaveLength(50);
  });

  it("uses the wave radius: a donor 8 km away joins in wave 2, not wave 1", () => {
    const far = [cand("far", { distanceKm: 8 })];
    expect(selectDonors(far, req(), 1, NOW)).toEqual([]);
    expect(ids(selectDonors(far, req(), 2, NOW))).toEqual(["far"]);
  });

  it("skips donors already alerted for the request, and ineligible donors", () => {
    const picked = selectDonors(
      [cand("again", { alreadyAlerted: true }), cand("recent", { lastDonatedOn: "2026-10-01" }), cand("ok")],
      req(),
      1,
      NOW,
    );
    expect(ids(picked)).toEqual(["ok"]);
  });

  it.each(["fulfilled", "expired", "cancelled", "frozen", "held"] as const)("sends nothing once the request is %s", (status) => {
    expect(selectDonors([cand("a")], req({ status }), 1, NOW)).toEqual([]);
  });

  it("unverified requests stop after wave 1", () => {
    const pool = [cand("a", { distanceKm: 3 })];
    expect(ids(selectDonors(pool, req({ trustLevel: "unverified" }), 1, NOW))).toEqual(["a"]);
    expect(selectDonors(pool, req({ trustLevel: "unverified" }), 2, NOW)).toEqual([]);
    expect(selectDonors(pool, req({ trustLevel: "unverified" }), 3, NOW)).toEqual([]);
  });
});

describe("rare registry donors (7.2)", () => {
  const rare = (group: Candidate["group"]) => [cand("rare", { group, rareRegistryOptIn: true, distanceKm: 3 })];

  it("for an Rh-positive request: only wave 3 and only coordinator_verified", () => {
    expect(selectDonors(rare("O-"), req({ trustLevel: "coordinator_verified" }), 1, NOW)).toEqual([]);
    expect(selectDonors(rare("O-"), req({ trustLevel: "coordinator_verified" }), 2, NOW)).toEqual([]);
    expect(selectDonors(rare("O-"), req({ trustLevel: "slip_verified" }), 3, NOW)).toEqual([]);
    expect(ids(selectDonors(rare("O-"), req({ trustLevel: "coordinator_verified" }), 3, NOW))).toEqual(["rare"]);
  });

  it("for an Rh-negative request: from wave 1", () => {
    expect(ids(selectDonors(rare("O-"), req({ group: "O-" }), 1, NOW))).toEqual(["rare"]);
  });

  it("for a Bombay request: from wave 1", () => {
    expect(ids(selectDonors(rare("bombay"), req({ group: "bombay" }), 1, NOW))).toEqual(["rare"]);
  });

  it("rareRegistryAllowed truth table", () => {
    expect(rareRegistryAllowed(1, { group: "A+", trustLevel: "coordinator_verified" })).toBe(false);
    expect(rareRegistryAllowed(3, { group: "A+", trustLevel: "coordinator_verified" })).toBe(true);
    expect(rareRegistryAllowed(3, { group: "A+", trustLevel: "unverified" })).toBe(false);
    expect(rareRegistryAllowed(1, { group: "AB-", trustLevel: "unverified" })).toBe(true);
  });
});

describe("planCheck", () => {
  const base = { status: "open" as const, trustLevel: "slip_verified" as const, units: 2, expiresAt: new Date(NOW.getTime() + 6 * H) };

  it("at posting fires wave 1 and checks again in 20 min", () => {
    expect(planCheck({ ...base, currentWave: 0 }, 0, NOW)).toEqual({
      action: "send_wave", wave: 1, nextCheckAt: new Date(NOW.getTime() + 20 * 60_000), escalate: false,
    });
  });

  it("short after wave 1 fires wave 2 and checks again in 30 min", () => {
    expect(planCheck({ ...base, currentWave: 1 }, 1, NOW)).toEqual({
      action: "send_wave", wave: 2, nextCheckAt: new Date(NOW.getTime() + 30 * 60_000), escalate: false,
    });
  });

  it("short after wave 2 fires wave 3 and escalates, with no further check", () => {
    expect(planCheck({ ...base, currentWave: 2 }, 2, NOW)).toEqual({ action: "send_wave", wave: 3, nextCheckAt: null, escalate: true });
  });

  it("nothing after wave 3", () => {
    expect(planCheck({ ...base, currentWave: 3 }, 0, NOW)).toEqual({ action: "none" });
  });

  it("unverified stops after wave 1", () => {
    expect(planCheck({ ...base, trustLevel: "unverified", currentWave: 1 }, 0, NOW)).toEqual({ action: "stop" });
  });

  it("fulfils when the target is reached (2 units -> 3)", () => {
    expect(planCheck({ ...base, currentWave: 1 }, 3, NOW)).toEqual({ action: "fulfil" });
    expect(planCheck({ ...base, currentWave: 1 }, 2, NOW).action).toBe("send_wave");
  });

  it("expires only after expires_at", () => {
    expect(planCheck({ ...base, currentWave: 1, expiresAt: NOW }, 0, NOW).action).toBe("send_wave");
    expect(planCheck({ ...base, currentWave: 1, expiresAt: new Date(NOW.getTime() - 1) }, 0, NOW)).toEqual({ action: "expire" });
  });

  it.each(["fulfilled", "expired", "cancelled", "frozen", "held"] as const)("does nothing for a %s request", (status) => {
    expect(planCheck({ ...base, status, currentWave: 1 }, 0, NOW)).toEqual({ action: "none" });
  });
});
