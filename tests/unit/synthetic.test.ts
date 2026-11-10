import { describe, expect, it } from "vitest";
import { BOX, generateSyntheticDonors, roundCoord } from "../../db/seed/synthetic";

const today = new Date("2026-11-09T00:00:00Z");
const donors = generateSyntheticDonors(42, today);
const group = (d: (typeof donors)[number]) => (d.is_bombay ? "bombay" : `${d.abo}${d.rh === "pos" ? "+" : "-"}`);

function ageOn(dob: string, on: Date) {
  const b = new Date(dob + "T00:00:00Z");
  let age = on.getUTCFullYear() - b.getUTCFullYear();
  if (on.getUTCMonth() < b.getUTCMonth() || (on.getUTCMonth() === b.getUTCMonth() && on.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

describe("generateSyntheticDonors", () => {
  it("creates 50 donors with the demo group mix", () => {
    expect(donors).toHaveLength(50);
    const counts = donors.reduce<Record<string, number>>((m, d) => ({ ...m, [group(d)]: (m[group(d)] ?? 0) + 1 }), {});
    expect(counts).toEqual({ "O+": 14, "B+": 12, "A+": 10, "AB+": 5, "O-": 3, "A-": 2, "B-": 2, "AB-": 1, bombay: 1 });
  });

  it("stores Bombay with null ABO and Rh (matches the table check)", () => {
    for (const d of donors) expect(d.is_bombay).toBe(d.abo === null && d.rh === null);
  });

  it("places everyone inside the Chennai box, rounded to 0.005 degrees", () => {
    for (const d of donors) {
      expect(d.lat).toBeGreaterThanOrEqual(BOX.latMin);
      expect(d.lat).toBeLessThanOrEqual(BOX.latMax);
      expect(d.lng).toBeGreaterThanOrEqual(BOX.lngMin);
      expect(d.lng).toBeLessThanOrEqual(BOX.lngMax);
      expect(roundCoord(d.lat)).toBe(d.lat);
      expect(roundCoord(d.lng)).toBe(d.lng);
    }
  });

  it("gives ages 18 to 65, radius 5/10/20 and responsiveness 0..1", () => {
    for (const d of donors) {
      const age = ageOn(d.dob, today);
      expect(age).toBeGreaterThanOrEqual(18);
      expect(age).toBeLessThanOrEqual(65);
      expect([5, 10, 20]).toContain(d.radius_km);
      expect(d.responsiveness).toBeGreaterThanOrEqual(0);
      expect(d.responsiveness).toBeLessThanOrEqual(1);
      if (d.last_donated_on) expect(new Date(d.last_donated_on) < today).toBe(true);
    }
  });

  it("only offers the rare registry to Rh-negative or Bombay donors", () => {
    for (const d of donors.filter((x) => x.rare_registry_opt_in)) expect(d.is_bombay || d.rh === "neg").toBe(true);
  });

  it("uses unique wa_ids that can never be a real Indian mobile", () => {
    expect(new Set(donors.map((d) => d.wa_id)).size).toBe(50);
    for (const d of donors) expect(d.wa_id).toMatch(/^910000000\d{3}$/);
  });

  it("is deterministic for a seed", () => {
    expect(generateSyntheticDonors(42, today)).toEqual(donors);
    expect(generateSyntheticDonors(7, today)).not.toEqual(donors);
  });
});

describe("roundCoord", () => {
  it("rounds to the nearest 0.005", () => {
    expect(roundCoord(13.0826)).toBe(13.085);
    expect(roundCoord(80.2701)).toBe(80.27);
    expect(roundCoord(12.8524)).toBe(12.85);
  });
});
