// ~50 synthetic donors for simulation mode (PRD 14). Deterministic for a given seed.

export type SyntheticDonor = {
  wa_id: string;
  name: string;
  lang: "en" | "ta" | "te";
  abo: "A" | "B" | "AB" | "O" | null;
  rh: "pos" | "neg" | null;
  is_bombay: boolean;
  dob: string; // YYYY-MM-DD
  sex: "male" | "female" | "other";
  weight_band: "45_54" | "55_plus";
  lat: number;
  lng: number;
  radius_km: 5 | 10 | 20;
  last_donated_on: string | null;
  night_ok: boolean;
  rare_registry_opt_in: boolean;
  responsiveness: number;
  consent_version: string;
};

// Chennai bounding box from PRD 14.
export const BOX = { latMin: 12.85, latMax: 13.2, lngMin: 80.1, lngMax: 80.3 };

// Demo mix only, NOT population statistics: weighted toward O+, B+, A+ as PRD 14 asks,
// a few Rh-negative, one Bombay. 50 in total.
export const GROUP_COUNTS: [string, number][] = [
  ["O+", 14], ["B+", 12], ["A+", 10], ["AB+", 5],
  ["O-", 3], ["A-", 2], ["B-", 2], ["AB-", 1],
  ["bombay", 1],
];

/** Home location rounded to 0.005 degrees (~500 m) before storing (PRD 9.4 step 8). */
export function roundCoord(x: number): number {
  return Math.round(x * 200) / 200;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function generateSyntheticDonors(seed = 42, today = new Date()): SyntheticDonor[] {
  const rnd = mulberry32(seed);
  const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];

  const groups = GROUP_COUNTS.flatMap(([g, n]) => Array<string>(n).fill(g));
  for (let i = groups.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [groups[i], groups[j]] = [groups[j], groups[i]];
  }

  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  return groups.map((g, i) => {
    const n = String(i + 1).padStart(3, "0");
    const isBombay = g === "bombay";
    const rare = isBombay || g.endsWith("-");
    const r = rnd();
    return {
      // "91" + a national number starting with 0: never a valid Indian mobile, so never a real person.
      wa_id: `910000000${n}`,
      name: `Sim ${n}`,
      lang: pick(["en", "ta", "te"] as const),
      abo: isBombay ? null : (g.slice(0, -1) as SyntheticDonor["abo"]),
      rh: isBombay ? null : g.endsWith("+") ? "pos" : "neg",
      is_bombay: isBombay,
      dob: isoDate(t - Math.floor(between(18.5, 60) * 365.25) * DAY),
      sex: r < 0.05 ? "other" : r < 0.6 ? "male" : "female",
      weight_band: rnd() < 0.85 ? "55_plus" : "45_54",
      lat: roundCoord(between(BOX.latMin, BOX.latMax)),
      lng: roundCoord(between(BOX.lngMin, BOX.lngMax)),
      radius_km: pick([5, 10, 20] as const),
      last_donated_on: rnd() < 0.3 ? null : isoDate(t - Math.floor(between(10, 400)) * DAY),
      night_ok: rnd() < 0.3,
      rare_registry_opt_in: rare && rnd() < 0.7,
      responsiveness: Math.round(between(0.2, 0.9) * 100) / 100,
      consent_version: "synthetic",
    };
  });
}
