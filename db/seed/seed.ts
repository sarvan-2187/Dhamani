// npm run db:seed   hospitals from hospitals.csv, synthetic donors, coordinators. Safe to re-run.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Pool } from "@neondatabase/serverless";
import { createPool } from "../client.ts";
import { parseHospitals } from "./csv.ts";
import { generateSyntheticDonors } from "./synthetic.ts";
import { hashPassword } from "../../lib/auth/password.ts";

export async function seed(pool: Pool) {
  const hospitals = parseHospitals(readFileSync(join(import.meta.dirname, "hospitals.csv"), "utf8"));
  const donors = generateSyntheticDonors();
  const emailList = (v: string | undefined) =>
    (v ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  const emails = emailList(process.env.COORDINATOR_EMAILS);
  const superAdmins = new Set(emailList(process.env.SUPER_ADMIN_EMAILS));
  for (const e of superAdmins) {
    if (!emails.includes(e)) throw new Error(`SUPER_ADMIN_EMAILS: ${e} must also be in COORDINATOR_EMAILS`);
  }

  const client = await pool.connect();
  const newPasswords: [string, string][] = [];
  try {
    await client.query("begin");

    // One statement for all rows (hundreds of hospitals; one round trip each would be slow).
    const col = <K extends keyof (typeof hospitals)[number]>(k: K) => hospitals.map((h) => h[k]);
    await client.query(
      `insert into hospitals (name, blood_centre_licence, address, city, geog, eraktkosh_url, has_apheresis)
       select name, licence, address, city, st_setsrid(st_makepoint(lng, lat), 4326)::geography, url, apheresis
       from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::float8[], $6::float8[], $7::text[], $8::bool[])
         as t(name, licence, address, city, lat, lng, url, apheresis)
       on conflict (name, city) do update set
         blood_centre_licence = excluded.blood_centre_licence, address = excluded.address,
         geog = excluded.geog, eraktkosh_url = excluded.eraktkosh_url, has_apheresis = excluded.has_apheresis`,
      [
        col("name"), col("blood_centre_licence"), col("address"), col("city"),
        col("lat"), col("lng"), col("eraktkosh_url"), col("has_apheresis"),
      ],
    );

    // Replace synthetic donors only; real donors are never touched.
    await client.query("delete from donors where is_synthetic");
    for (const d of donors) {
      await client.query(
        `insert into donors (wa_id, name, lang, abo, rh, is_bombay, dob, sex, weight_band, home_geog, radius_km,
           last_donated_on, night_ok, rare_registry_opt_in, responsiveness, consent_version, is_synthetic)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, st_setsrid(st_makepoint($11, $10), 4326)::geography, $12,
           $13, $14, $15, $16, $17, true)`,
        [
          d.wa_id, d.name, d.lang, d.abo, d.rh, d.is_bombay, d.dob, d.sex, d.weight_band, d.lat, d.lng,
          d.radius_km, d.last_donated_on, d.night_ok, d.rare_registry_opt_in, d.responsiveness, d.consent_version,
        ],
      );
    }

    // Existing coordinators keep their password (role follows SUPER_ADMIN_EMAILS); new ones get a random one, printed once.
    for (const email of emails) {
      const password = randomBytes(12).toString("base64url");
      const role = superAdmins.has(email) ? "super_admin" : "coordinator";
      const { rows } = await client.query(
        `insert into coordinators (email, name, password_hash, role) values ($1, $2, $3, $4)
         on conflict (email) do update set role = excluded.role
         returning (xmax = 0) as inserted`,
        [email, email.split("@")[0], await hashPassword(password), role],
      );
      if (rows[0].inserted) newPasswords.push([email, password]);
    }

    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }

  console.log(
    `seed: ${hospitals.length} hospitals, ${donors.length} synthetic donors, ${emails.length} coordinators (${superAdmins.size} super admin)`,
  );
  if (!emails.length) console.log("seed: COORDINATOR_EMAILS is empty, no coordinator accounts created");
  for (const [email, password] of newPasswords) {
    console.log(`seed: new coordinator ${email} password: ${password}  (shown once, store it now)`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = createPool();
  try {
    await seed(pool);
  } finally {
    await pool.end();
  }
}
