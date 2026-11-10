// Runs one check for a request (PRD 7.2): at posting (current_wave 0) and from the cron tick (M6).
// Loads candidates with PostGIS, applies the pure matching rules, records alerts, sends request_alert.
import { groupFromDb, type BloodGroup, type Component } from "../blood/compat";
import type { TrustLevel } from "../blood/eligibility";
import { db } from "../db";
import { requestCode } from "../requests/slug";
import { maskPhone } from "../safety/mask";
import { adapterFor } from "../wa/adapter";
import { formatDateTime, waTranslator } from "../wa/i18n";
import { logMessage } from "../wa/store";
import { buildTemplate, PAYLOADS } from "../wa/templates";
import type { Lang } from "../wa/types";
import { closeRequest } from "./close";
import { planCheck, selectDonors, WAVES, type Candidate, type RequestStatus, type Wave } from "./waves";

type Req = {
  id: string;
  slug: string;
  status: RequestStatus;
  group: BloodGroup;
  component: Component;
  units: number;
  isCritical: boolean;
  trustLevel: TrustLevel;
  currentWave: 0 | Wave;
  expiresAt: Date;
  neededBy: Date;
  requesterWaId: string;
  hospitalId: string;
  hospitalName: string;
  city: string;
};

async function loadRequest(id: string): Promise<Req | null> {
  const [r] = await db()`
    select r.id, r.public_slug, r.status, r.abo, r.rh, r.is_bombay, r.component, r.units, r.is_critical, r.trust_level,
           r.current_wave, r.expires_at, r.needed_by, r.requester_wa_id, h.id as hospital_id, h.name as hospital_name, h.city
    from requests r join hospitals h on h.id = r.hospital_id where r.id = ${id}`;
  if (!r) return null;
  return {
    id: r.id,
    slug: r.public_slug,
    status: r.status,
    group: groupFromDb(r as never),
    component: r.component,
    units: r.units,
    isCritical: r.is_critical,
    trustLevel: r.trust_level,
    currentWave: r.current_wave,
    expiresAt: new Date(r.expires_at),
    neededBy: new Date(r.needed_by),
    requesterWaId: r.requester_wa_id,
    hospitalId: r.hospital_id,
    hospitalName: r.hospital_name,
    city: r.city,
  };
}

type Row = Candidate & { waId: string; lang: Lang; isSynthetic: boolean };

async function loadCandidates(req: Req, wave: Wave): Promise<Row[]> {
  const rows = await db()`
    select d.id, d.wa_id, d.lang, d.is_synthetic, d.abo, d.rh, d.is_bombay, to_char(d.dob, 'YYYY-MM-DD') as dob, d.sex,
           d.weight_band, to_char(d.last_donated_on, 'YYYY-MM-DD') as last_donated_on, d.paused_until, d.stopped_at,
           d.night_ok, d.radius_km, d.rare_registry_opt_in, d.responsiveness::float8 as responsiveness, d.last_alerted_at,
           st_distance(d.home_geog, h.geog) / 1000 as distance_km,
           (select count(*)::int from alerts a where a.donor_id = d.id and a.sent_at > now() - interval '7 days') as a7,
           (select count(*)::int from alerts a where a.donor_id = d.id and a.sent_at > now() - interval '30 days') as a30,
           exists (select 1 from alerts a where a.donor_id = d.id and a.request_id = ${req.id}) as already
    from donors d, hospitals h
    where h.id = ${req.hospitalId} and d.stopped_at is null and d.wa_id <> ${req.requesterWaId}
      and st_dwithin(d.home_geog, h.geog, ${WAVES[wave].radiusKm * 1000})`;
  return rows.map((d) => ({
    id: d.id,
    waId: d.wa_id,
    lang: d.lang,
    isSynthetic: d.is_synthetic,
    group: groupFromDb(d as never),
    dob: d.dob,
    sex: d.sex,
    weightBand: d.weight_band,
    lastDonatedOn: d.last_donated_on,
    pausedUntil: d.paused_until ? new Date(d.paused_until) : null,
    stoppedAt: d.stopped_at ? new Date(d.stopped_at) : null,
    nightOk: d.night_ok,
    radiusKm: d.radius_km,
    rareRegistryOptIn: d.rare_registry_opt_in,
    responsiveness: Number(d.responsiveness),
    lastAlertedAt: d.last_alerted_at ? new Date(d.last_alerted_at) : null,
    distanceKm: Number(d.distance_km),
    alertsLast7d: d.a7,
    alertsLast30d: d.a30,
    alreadyAlerted: d.already,
  }));
}

type T = (k: string, p?: Record<string, string>) => string;

async function sendAlert(req: Req, d: Row) {
  const t = waTranslator(d.lang) as unknown as T;
  const values = {
    group: req.group === "bombay" ? t("bombay") : req.group,
    component: t(`components.${req.component}`),
    hospital: req.hospitalName,
    area: req.city,
    neededBy: formatDateTime(req.neededBy, d.lang),
    distance: d.distanceKm.toFixed(1),
    code: requestCode(req.slug),
  };
  const template = buildTemplate(
    "request_alert",
    d.lang,
    {
      group: values.group,
      component: values.component,
      hospital: values.hospital,
      area: values.area,
      needed_by: values.neededBy,
      distance_km: values.distance,
      request_code: values.code,
    },
    PAYLOADS.request_alert(req.id),
  );
  await adapterFor({ waId: d.waId, isSynthetic: d.isSynthetic }).sendInteractive(
    d.waId,
    {
      type: "button",
      body: t("alert", values),
      buttons: [
        { id: `DONATE:${req.id}`, title: t("buttons.donate") },
        { id: `NOT_NOW:${req.id}`, title: t("buttons.notNow") },
        { id: "PAUSE", title: t("buttons.pauseAlerts") },
      ],
    },
    { requestId: req.id, fallback: template },
  );
}

/** Sends one wave; returns how many donors were alerted. */
async function sendWave(req: Req, wave: Wave, now: Date): Promise<number> {
  const candidates = await loadCandidates(req, wave);
  const picked = selectDonors(candidates, { ...req }, wave, now);
  if (!picked.length) return 0;
  const sql = db();
  // unique (request_id, donor_id) makes a repeated check harmless.
  const inserted = await sql`
    insert into alerts (request_id, donor_id, wave)
    select ${req.id}, unnest(${picked.map((p) => p.id)}::uuid[]), ${wave}
    on conflict (request_id, donor_id) do nothing returning donor_id`;
  const fresh = inserted.map((r) => r.donor_id as string);
  await sql`update donors set last_alerted_at = now() where id = any(${fresh}::uuid[])`;

  const byId = new Map(candidates.map((c) => [c.id, c]));
  let sent = 0;
  for (const id of fresh) {
    const d = byId.get(id)!;
    try {
      await sendAlert(req, d);
      sent++;
    } catch (e) {
      // Nothing reached the donor, so drop the alert row: it must not count toward the 7/30 day caps,
      // and the next wave check may try this donor again (e.g. after an expired token is replaced).
      const error = (e as Error).message;
      console.error(`alert send failed for ${maskPhone(d.waId)}: ${error}`);
      await sql`delete from alerts where request_id = ${req.id} and donor_id = ${id}`.catch(() => {});
      await logMessage({ direction: "out", waId: d.waId, channel: "whatsapp", kind: "send_failed", body: { error }, requestId: req.id }).catch(() => {});
    }
  }
  return sent;
}

/** One check for a request (PRD 7.2 / 7.3). Returns what happened, for logging and tests. */
export async function advanceRequest(requestId: string, now = new Date()) {
  const sql = db();
  const req = await loadRequest(requestId);
  if (!req) return { action: "missing" as const };
  const [{ n }] = await sql`select count(*)::int as n from confirmations where request_id = ${req.id}`;
  const decision = planCheck({ ...req }, n, now);

  switch (decision.action) {
    case "send_wave": {
      const alerted = await sendWave(req, decision.wave, now);
      await sql`
        update requests set current_wave = ${decision.wave}, next_check_at = ${decision.nextCheckAt?.toISOString() ?? null},
               escalated = escalated or ${decision.escalate}
        where id = ${req.id} and status = 'open'`;
      return { action: "send_wave" as const, wave: decision.wave, alerted };
    }
    case "fulfil":
      await closeRequest(req.id, "fulfilled");
      return decision;
    case "expire":
      await closeRequest(req.id, "expired");
      return decision;
    case "stop":
      await sql`update requests set next_check_at = null where id = ${req.id}`;
      return decision;
    default:
      return decision;
  }
}
