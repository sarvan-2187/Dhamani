import { describe, expect, it } from "vitest";
import { score, scoreParts, updateResponsiveness, type ScoreInput } from "../../lib/matching/score";

const NOW = new Date("2026-11-10T12:00:00+05:30");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

const input = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  distanceKm: 0,
  waveRadiusKm: 5,
  responsiveness: 0.5,
  lastAlertedAt: null,
  donorGroup: "O+",
  patientGroup: "O+",
  now: NOW,
  ...over,
});

describe("score = 0.45 proximity + 0.25 responsiveness + 0.20 rest + 0.10 exact_group", () => {
  it("next door, new donor, never alerted, same group", () => {
    expect(score(input())).toBeCloseTo(0.45 + 0.125 + 0.2 + 0.1, 10);
  });

  it("halfway, fully responsive, alerted 15 days ago, different group", () => {
    const i = input({ distanceKm: 2.5, responsiveness: 1, lastAlertedAt: daysAgo(15), donorGroup: "O-" });
    expect(scoreParts(i)).toEqual({ proximity: 0.5, responsiveness: 1, rest: 0.5, exactGroup: 0 });
    expect(score(i)).toBeCloseTo(0.225 + 0.25 + 0.1, 10);
  });

  it("proximity is relative to the wave radius and clamped to 0..1", () => {
    expect(scoreParts(input({ distanceKm: 7.5, waveRadiusKm: 15 })).proximity).toBeCloseTo(0.5);
    expect(scoreParts(input({ distanceKm: 6, waveRadiusKm: 5 })).proximity).toBe(0);
  });

  it("rest caps at 30 days; never alerted is 1", () => {
    expect(scoreParts(input({ lastAlertedAt: daysAgo(45) })).rest).toBe(1);
    expect(scoreParts(input({ lastAlertedAt: daysAgo(30) })).rest).toBe(1);
    expect(scoreParts(input({ lastAlertedAt: daysAgo(3) })).rest).toBeCloseTo(0.1);
    expect(scoreParts(input({ lastAlertedAt: null })).rest).toBe(1);
  });

  it("exact group: same ABO and Rh, or both Bombay", () => {
    expect(scoreParts(input({ donorGroup: "bombay", patientGroup: "bombay" })).exactGroup).toBe(1);
    expect(scoreParts(input({ donorGroup: "A+", patientGroup: "AB+" })).exactGroup).toBe(0);
  });

  it("a closer donor outranks a farther one when all else is equal", () => {
    expect(score(input({ distanceKm: 1 }))).toBeGreaterThan(score(input({ distanceKm: 4 })));
  });
});

describe("responsiveness EMA, alpha 0.2", () => {
  it("moves 20% toward 1 on a reply within 30 min, toward 0 otherwise", () => {
    expect(updateResponsiveness(0.5, true)).toBeCloseTo(0.6);
    expect(updateResponsiveness(0.5, false)).toBeCloseTo(0.4);
    expect(updateResponsiveness(1, true)).toBeCloseTo(1);
    expect(updateResponsiveness(0, false)).toBe(0);
  });
});
