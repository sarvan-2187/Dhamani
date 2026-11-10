// PRD 10.5 / 14 simulation panel (only when SIMULATION_MODE=true). Synthetic donors reply through the same
// webhook handler as real phones (handleInbound with the same button ids), so the demo exercises real code.
import { randomUUID } from "node:crypto";
import { generateSyntheticDonors } from "../../db/seed/synthetic";
import { db } from "../db";
import { handleInbound } from "../wa/flows/handle";
import { logMessage } from "../wa/store";
import { audit } from "./auth";

export const simulationEnabled = () => process.env.SIMULATION_MODE === "true";

/** Replaces the synthetic donors (and so their alerts and confirmations). Real donors are never touched. */
export async function reseedSyntheticDonors(actor: string): Promise<number> {
  const sql = db();
  const donors = generateSyntheticDonors(Date.now() % 100_000);
  const col = <K extends keyof (typeof donors)[number]>(k: K) => donors.map((d) => d[k]);
  await sql`delete from donors where is_synthetic`;
  await sql`
    insert into donors (wa_id, name, lang, abo, rh, is_bombay, dob, sex, weight_band, home_geog, radius_km,
                        last_donated_on, night_ok, rare_registry_opt_in, responsiveness, consent_version, is_synthetic)
    select wa_id, name, lang::lang, abo::abo, rh::rh, is_bombay, dob::date, sex::sex, weight_band::weight_band,
           st_setsrid(st_makepoint(lng, lat), 4326)::geography, radius_km, last_donated_on::date, night_ok, rare, resp, consent, true
    from unnest(${col("wa_id")}::text[], ${col("name")}::text[], ${col("lang")}::text[], ${col("abo")}::text[], ${col("rh")}::text[],
                ${col("is_bombay")}::bool[], ${col("dob")}::text[], ${col("sex")}::text[], ${col("weight_band")}::text[],
                ${col("lat")}::float8[], ${col("lng")}::float8[], ${col("radius_km")}::int[], ${col("last_donated_on")}::text[],
                ${col("night_ok")}::bool[], ${col("rare_registry_opt_in")}::bool[], ${col("responsiveness")}::numeric[],
                ${col("consent_version")}::text[])
      as t(wa_id, name, lang, abo, rh, is_bombay, dob, sex, weight_band, lat, lng, radius_km, last_donated_on, night_ok, rare, resp, consent)`;
  await audit(actor, "sim_reseed_donors");
  return donors.length;
}

export type SimMix = { donatePct: number; notNowPct: number }; // the rest stay silent

/** Pure: which reply each pending alert gets, from one random number per alert. */
export function assignReplies(n: number, mix: SimMix, rnd: () => number = Math.random): ("donate" | "not_now" | "silent")[] {
  return Array.from({ length: n }, () => {
    const x = rnd() * 100;
    return x < mix.donatePct ? "donate" : x < mix.donatePct + mix.notNowPct ? "not_now" : "silent";
  });
}

const ETAS = ["lt30", "30to60", "gt60"] as const;

/** Applies the mix to the request's simulated alerts that have no reply yet. Stops once the request closes. */
export async function simulateReplies(actor: string, requestId: string, mix: SimMix) {
  const sql = db();
  const pending = await sql`
    select d.wa_id from alerts a join donors d on d.id = a.donor_id
    where a.request_id = ${requestId} and a.response = 'none' and d.is_synthetic order by a.sent_at`;
  const plan = assignReplies(pending.length, mix);
  const done = { donate: 0, not_now: 0, silent: 0 };

  const tap = async (waId: string, replyId: string) => {
    await logMessage({ direction: "in", waId, channel: "simulated", kind: "reply", body: { replyId }, requestId });
    await handleInbound({ id: `sim-${randomUUID()}`, from: waId, at: new Date(), kind: "reply", replyId, rawType: "interactive" });
  };

  for (const [i, p] of pending.entries()) {
    const [r] = await sql`select status from requests where id = ${requestId}`;
    if (r?.status !== "open") break;
    const choice = plan[i];
    done[choice]++;
    if (choice === "not_now") await tap(p.wa_id, `NOT_NOW:${requestId}`);
    if (choice === "donate") {
      await tap(p.wa_id, `DONATE:${requestId}`);
      await tap(p.wa_id, `PRE:clear:${requestId}`);
      await tap(p.wa_id, `ETA:${ETAS[i % ETAS.length]}:${requestId}`);
    }
  }
  await audit(actor, `sim_replies_${done.donate}d_${done.not_now}n_${done.silent}s`, requestId);
  return { pending: pending.length, ...done };
}

/**
 * Deletes demo requests (those at "DEV ONLY" hospitals) with their alerts, confirmations, slips and messages,
 * plus simulated messages. Requests at real hospitals are never touched; audit_log rows stay (append only).
 */
export async function resetDemoData(actor: string): Promise<number> {
  const sql = db();
  const ids = (await sql`
    select r.id from requests r join hospitals h on h.id = r.hospital_id where h.name like 'DEV ONLY %'`).map((r) => r.id as string);
  await sql`delete from message_log where request_id = any(${ids}::uuid[]) or (channel = 'simulated' and request_id is null)`;
  await sql`delete from requests where id = any(${ids}::uuid[])`;
  await sql`update donors set last_alerted_at = null where is_synthetic`;
  await audit(actor, `sim_reset_demo_${ids.length}`);
  return ids.length;
}
