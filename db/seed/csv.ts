/** Minimal RFC 4180 parser: quoted fields, "" escapes, commas and newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) rows.push([...row, field]);
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/** Inverse of parseCsv: quotes fields containing comma, quote or newline. */
export function toCsv(rows: (string | number | boolean | null)[][]): string {
  const cell = (v: string | number | boolean | null) => {
    const s = v === null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

export const HOSPITAL_COLUMNS = [
  "name",
  "blood_centre_licence",
  "address",
  "city",
  "lat",
  "lng",
  "eraktkosh_url",
  "has_apheresis",
] as const;

export type HospitalRow = {
  name: string;
  blood_centre_licence: string | null;
  address: string;
  city: string;
  lat: number;
  lng: number;
  eraktkosh_url: string | null;
  has_apheresis: boolean;
};

/** Owner-supplied data: reject anything malformed rather than guess. */
export function parseHospitals(text: string): HospitalRow[] {
  const [header, ...rows] = parseCsv(text);
  if (header?.join(",") !== HOSPITAL_COLUMNS.join(",")) {
    throw new Error(`hospitals.csv header must be exactly: ${HOSPITAL_COLUMNS.join(",")}`);
  }
  return rows.map((r, i) => {
    const line = i + 2;
    if (r.length !== HOSPITAL_COLUMNS.length) throw new Error(`hospitals.csv line ${line}: expected 8 columns`);
    const [name, licence, address, city, lat, lng, url, apheresis] = r.map((f) => f.trim());
    const latN = Number(lat);
    const lngN = Number(lng);
    if (!name || !address || !city) throw new Error(`hospitals.csv line ${line}: name, address and city are required`);
    if (!lat || !Number.isFinite(latN) || latN < -90 || latN > 90) throw new Error(`hospitals.csv line ${line}: bad lat`);
    if (!lng || !Number.isFinite(lngN) || lngN < -180 || lngN > 180) throw new Error(`hospitals.csv line ${line}: bad lng`);
    if (apheresis !== "true" && apheresis !== "false") {
      throw new Error(`hospitals.csv line ${line}: has_apheresis must be true or false`);
    }
    return {
      name,
      blood_centre_licence: licence || null,
      address,
      city,
      lat: latN,
      lng: lngN,
      eraktkosh_url: url || null,
      has_apheresis: apheresis === "true",
    };
  });
}
