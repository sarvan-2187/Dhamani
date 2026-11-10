// npm run db:import-hospitals
// Builds hospitals.csv from the Government of India Blood Bank Directory (data.gov.in, OGD licence)
// for the states below, keeps the DEV ONLY demo rows, and writes hospitals.SOURCE.md.
// Only facts present in the source are used; anything missing stays empty or is skipped.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { HOSPITAL_COLUMNS, parseHospitals, toCsv, type HospitalRow } from "./csv.ts";

export const RESOURCE_ID = "fced6df9-a360-4e08-8ca0-f283fc74ce15";
export const SOURCE_URL = "https://www.data.gov.in/resource/blood-bank-directory-updated-till-last-month";

// Rough state bounding boxes, used only to reject coordinates that are clearly wrong (not stored).
export const STATES: Record<string, { latMin: number; latMax: number; lngMin: number; lngMax: number }> = {
  "Andhra Pradesh": { latMin: 12.5, latMax: 19.95, lngMin: 76.7, lngMax: 84.8 },
  Telangana: { latMin: 15.8, latMax: 19.95, lngMin: 77.2, lngMax: 81.4 },
  "Tamil Nadu": { latMin: 8.0, latMax: 13.6, lngMin: 76.2, lngMax: 80.4 },
  Kerala: { latMin: 8.2, latMax: 12.8, lngMin: 74.8, lngMax: 77.5 },
  Karnataka: { latMin: 11.5, latMax: 18.5, lngMin: 74.0, lngMax: 78.6 },
};

export type DirectoryRecord = Record<string, string | number | null | undefined>;

export type ImportStats = {
  byState: Record<string, { source: number; kept: number; badCoords: number; duplicate: number; missingFields: number }>;
  apheresisUnclear: number;
};

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const titleNa = (v: string) => (/^(na|n\/a|nil|-|0)$/i.test(v) ? "" : v);

/** Pure mapping from directory records to hospitals.csv rows. */
export function mapDirectoryRecords(records: DirectoryRecord[]): { rows: HospitalRow[]; stats: ImportStats } {
  const stats: ImportStats = { byState: {}, apheresisUnclear: 0 };
  const rows: HospitalRow[] = [];
  const seen = new Set<string>();

  for (const r of records) {
    const state = Object.keys(STATES).find((s) => s.toLowerCase() === clean(r._state).toLowerCase());
    if (!state) continue;
    const st = (stats.byState[state] ??= { source: 0, kept: 0, badCoords: 0, duplicate: 0, missingFields: 0 });
    st.source++;

    const name = clean(r._blood_bank_name);
    const city = clean(r._city) || clean(r._district);
    const pincode = titleNa(clean(r.pincode));
    const street = clean(r._address);
    if (!name || !city || !street) {
      st.missingFields++;
      continue;
    }

    const lat = Number(clean(r._latitude));
    const lng = Number(clean(r._longitude));
    const box = STATES[state];
    if (!(lat >= box.latMin && lat <= box.latMax && lng >= box.lngMin && lng <= box.lngMax)) {
      st.badCoords++;
      continue;
    }

    const key = `${name.toLowerCase()}|${city.toLowerCase()}`;
    if (seen.has(key)) {
      st.duplicate++;
      continue;
    }
    seen.add(key);

    const apheresis = clean(r._apheresis).toLowerCase();
    if (!["yes", "no", "na", ""].includes(apheresis)) stats.apheresisUnclear++;

    rows.push({
      name,
      blood_centre_licence: titleNa(clean(r._license__)) || null,
      address: pincode && !street.includes(pincode) ? `${street}, ${pincode}` : street,
      city,
      lat,
      lng,
      eraktkosh_url: null, // not in the directory
      has_apheresis: apheresis === "yes", // "no", "NA" and unclear values stay false: SDP stays blocked
    });
    st.kept++;
  }
  return { rows, stats };
}

async function fetchAll(key: string): Promise<DirectoryRecord[]> {
  const all: DirectoryRecord[] = [];
  for (let offset = 0; ; offset += 1000) {
    const u = new URL(`https://api.data.gov.in/resource/${RESOURCE_ID}`);
    u.search = new URLSearchParams({ "api-key": key, format: "json", limit: "1000", offset: String(offset) }).toString();
    const res = await fetch(u, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`data.gov.in HTTP ${res.status}`);
    const j = (await res.json()) as { total: number | string; records: DirectoryRecord[] };
    all.push(...j.records);
    if (!j.records.length || all.length >= Number(j.total)) return all;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const key = process.env.DATA_GOV_IN_API_KEY;
  if (!key) throw new Error("DATA_GOV_IN_API_KEY is not set in .env.local");

  const csvPath = join(import.meta.dirname, "hospitals.csv");
  const devRows = parseHospitals(readFileSync(csvPath, "utf8")).filter((h) => h.name.startsWith("DEV ONLY"));
  const records = await fetchAll(key);
  const { rows, stats } = mapDirectoryRecords(records);

  const csvRows = [...rows, ...devRows].map((h) => HOSPITAL_COLUMNS.map((c) => h[c]));
  writeFileSync(csvPath, toCsv([[...HOSPITAL_COLUMNS], ...csvRows]));
  parseHospitals(readFileSync(csvPath, "utf8")); // the seed must accept what we wrote

  const today = new Date().toISOString().slice(0, 10);
  const table = Object.entries(stats.byState)
    .map(([s, v]) => `| ${s} | ${v.source} | ${v.kept} | ${v.badCoords} | ${v.duplicate} | ${v.missingFields} |`)
    .join("\n");
  writeFileSync(
    join(import.meta.dirname, "hospitals.SOURCE.md"),
    `# hospitals.csv provenance

- Source: Blood Bank Directory (updated till last month), Government of India, Open Government Data Platform: ${SOURCE_URL}
- API resource: ${RESOURCE_ID}. Licence: Government Open Data License - India.
- Fetched: ${today} by \`npm run db:import-hospitals\` (${records.length} records nationally).
- States: ${Object.keys(STATES).join(", ")}. Plus ${devRows.length} DEV ONLY demo rows, kept for the demo script.

| State | In source | Imported | Skipped: bad or missing coordinates | Skipped: duplicate name + city | Skipped: missing name/city/address |
| --- | --- | --- | --- | --- | --- |
${table}

Rules: only fields present in the source are used. \`has_apheresis\` is true only where the source says "yes"
(${stats.apheresisUnclear} records had an unclear value and are false). \`eraktkosh_url\` is empty: the directory has no link.
Phone numbers, emails and nodal officer names are not imported.

Caution: the newest licence renewal date in these states is from 2022, so details may be out of date.
A coordinator should confirm a blood centre by phone before relying on it.
`,
  );
  console.log(`import: wrote ${rows.length} hospitals + ${devRows.length} DEV ONLY rows`);
  for (const [s, v] of Object.entries(stats.byState)) console.log(`  ${s}: ${v.kept}/${v.source} kept`);
}
