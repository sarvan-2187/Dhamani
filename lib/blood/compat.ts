// PRD section 6.1 to 6.4. The app only pre-screens; the blood centre decides.

export const ABO_RH_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] as const;
export type AboRhGroup = (typeof ABO_RH_GROUPS)[number];
export type BloodGroup = AboRhGroup | "bombay";
export const ALL_GROUPS: readonly BloodGroup[] = [...ABO_RH_GROUPS, "bombay"];

export type Component = "whole_blood" | "prbc" | "platelets_rdp" | "platelets_sdp" | "ffp";

type Abo = "A" | "B" | "AB" | "O";

/** DB columns (abo, rh, is_bombay) to a group. */
export function groupFromDb(row: { abo: Abo | null; rh: "pos" | "neg" | null; is_bombay: boolean }): BloodGroup {
  if (row.is_bombay) return "bombay";
  if (!row.abo || !row.rh) throw new Error("abo and rh are required when not Bombay");
  return `${row.abo}${row.rh === "pos" ? "+" : "-"}` as AboRhGroup;
}

export function groupToDb(g: BloodGroup): { abo: Abo | null; rh: "pos" | "neg" | null; is_bombay: boolean } {
  if (g === "bombay") return { abo: null, rh: null, is_bombay: true };
  return { abo: g.slice(0, -1) as Abo, rh: g.endsWith("+") ? "pos" : "neg", is_bombay: false };
}

const abo = (g: AboRhGroup) => g.slice(0, -1) as Abo;
const isNeg = (g: AboRhGroup) => g.endsWith("-");

// Red cells (6.1): patient ABO -> donor ABO allowed. Rh-negative patients also need Rh-negative donors.
const RED_CELL_ABO: Record<Abo, Abo[]> = { O: ["O"], A: ["A", "O"], B: ["B", "O"], AB: ["AB", "A", "B", "O"] };
// Plasma (6.2): patient ABO -> donor ABO allowed. Rh ignored.
const PLASMA_ABO: Record<Abo, Abo[]> = { O: ["O", "A", "B", "AB"], A: ["A", "AB"], B: ["B", "AB"], AB: ["AB"] };

/** Can a donor of `donor` group be alerted for a patient of `patient` group needing `component`? */
export function isCompatible(component: Component, patient: BloodGroup, donor: BloodGroup): boolean {
  // 6.4 and the Bombay rows of 6.1 to 6.3: Bombay only ever with Bombay.
  if (patient === "bombay" || donor === "bombay") return patient === donor;

  switch (component) {
    case "whole_blood":
    case "prbc":
      return RED_CELL_ABO[abo(patient)].includes(abo(donor)) && (!isNeg(patient) || isNeg(donor));
    case "ffp":
      return PLASMA_ABO[abo(patient)].includes(abo(donor));
    case "platelets_rdp":
    case "platelets_sdp":
      return patient === donor; // 6.3: exact ABO and Rh only
  }
}

export function compatibleDonorGroups(component: Component, patient: BloodGroup): BloodGroup[] {
  return ALL_GROUPS.filter((d) => isCompatible(component, patient, d));
}

/** 6.3: SDP platelets need an apheresis centre; block posting otherwise. */
export function postingBlockReason(component: Component, hospital: { has_apheresis: boolean }): "needs_apheresis" | null {
  return component === "platelets_sdp" && !hospital.has_apheresis ? "needs_apheresis" : null;
}

export const isRhNegativeOrBombay = (g: BloodGroup) => g === "bombay" || g.endsWith("-");
