import { describe, expect, it } from "vitest";
import {
  ALL_GROUPS,
  compatibleDonorGroups,
  groupFromDb,
  groupToDb,
  isCompatible,
  postingBlockReason,
  type BloodGroup,
  type Component,
} from "../../lib/blood/compat";

const ALL8: BloodGroup[] = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

// PRD 6.1, transcribed row by row.
const RED_CELLS: Record<BloodGroup, BloodGroup[]> = {
  "O-": ["O-"],
  "O+": ["O+", "O-"],
  "A-": ["A-", "O-"],
  "A+": ["A+", "A-", "O+", "O-"],
  "B-": ["B-", "O-"],
  "B+": ["B+", "B-", "O+", "O-"],
  "AB-": ["AB-", "A-", "B-", "O-"],
  "AB+": ALL8,
  bombay: ["bombay"],
};

// PRD 6.2: Rh ignored. O <- O, A, B, AB; A <- A, AB; B <- B, AB; AB <- AB; Bombay <- Bombay.
const anyRh = (...abo: string[]) => ALL8.filter((g) => abo.includes(g.slice(0, -1)));
const PLASMA: Record<BloodGroup, BloodGroup[]> = {
  "O+": anyRh("O", "A", "B", "AB"),
  "O-": anyRh("O", "A", "B", "AB"),
  "A+": anyRh("A", "AB"),
  "A-": anyRh("A", "AB"),
  "B+": anyRh("B", "AB"),
  "B-": anyRh("B", "AB"),
  "AB+": anyRh("AB"),
  "AB-": anyRh("AB"),
  bombay: ["bombay"],
};

// PRD 6.3: exact ABO and Rh only.
const PLATELETS = Object.fromEntries(ALL_GROUPS.map((g) => [g, [g]])) as Record<BloodGroup, BloodGroup[]>;

const TABLES: [Component, Record<BloodGroup, BloodGroup[]>][] = [
  ["whole_blood", RED_CELLS],
  ["prbc", RED_CELLS],
  ["ffp", PLASMA],
  ["platelets_rdp", PLATELETS],
  ["platelets_sdp", PLATELETS],
];

describe.each(TABLES)("%s compatibility matches the PRD table", (component, table) => {
  it.each(ALL_GROUPS.map((p) => [p]))("patient %s", (patient) => {
    for (const donor of ALL_GROUPS) {
      expect(isCompatible(component, patient, donor), `${patient} <- ${donor}`).toBe(table[patient].includes(donor));
    }
    expect([...compatibleDonorGroups(component, patient)].sort()).toEqual([...table[patient]].sort());
  });
});

describe("Bombay (6.4)", () => {
  it.each(TABLES.map(([c]) => [c]))("a Bombay donor is only ever alerted for a Bombay patient (%s)", (component) => {
    for (const patient of ALL_GROUPS) expect(isCompatible(component, patient, "bombay")).toBe(patient === "bombay");
  });

  it("an O donor is never matched to a Bombay patient, even though Bombay types as O", () => {
    for (const [component] of TABLES) {
      expect(isCompatible(component, "bombay", "O-")).toBe(false);
      expect(isCompatible(component, "bombay", "O+")).toBe(false);
    }
  });
});

describe("SDP platelets need apheresis (6.3)", () => {
  it("blocks platelets_sdp at a centre without apheresis", () => {
    expect(postingBlockReason("platelets_sdp", { has_apheresis: false })).toBe("needs_apheresis");
    expect(postingBlockReason("platelets_sdp", { has_apheresis: true })).toBeNull();
  });

  it.each(["whole_blood", "prbc", "platelets_rdp", "ffp"] as const)("never blocks %s", (c) => {
    expect(postingBlockReason(c, { has_apheresis: false })).toBeNull();
  });
});

describe("DB conversion", () => {
  it.each(ALL_GROUPS.map((g) => [g]))("round-trips %s", (g) => {
    expect(groupFromDb(groupToDb(g))).toBe(g);
  });

  it("stores Bombay with null ABO and Rh", () => {
    expect(groupToDb("bombay")).toEqual({ abo: null, rh: null, is_bombay: true });
    expect(groupToDb("AB-")).toEqual({ abo: "AB", rh: "neg", is_bombay: false });
  });

  it("rejects a non-Bombay row without ABO or Rh", () => {
    expect(() => groupFromDb({ abo: null, rh: "pos", is_bombay: false })).toThrow();
  });
});
