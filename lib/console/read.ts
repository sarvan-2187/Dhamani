// PRD 10.5 console reads. Every query runs as dhamani_coordinator (0002/0007 RLS): read-only, and a donor row
// is visible only through an alert or confirmation, so no screen here can list all donors. Phone numbers
// never leave this file unmasked.
import type { NeonQueryPromise } from "@neondatabase/serverless";
import { groupFromDb } from "../blood/compat";
import { db } from "../db";
import { requestCode } from "../requests/slug";

type Row = Record<string, unknown>;
type Query = NeonQueryPromise<false, false>;

/** Runs the queries in one transaction under the coordinator role; returns their rows in order. */
async function asCoordinator(build: (sql: ReturnType<typeof db>) => Query[]): Promise<Row[][]> {
  const sql = db();
  const res = (await sql.transaction([sql`set local role dhamani_coordinator`, ...build(sql)])) as Row[][];
  return res.slice(1);
}

/** "919876543210" or "+91 98765 43210" inside any text -> "••••3210". */
export function maskDigits(text: string): string {
  return text.replace(/\+?\d[\d\s-]{6,}\d/g, (m) => `••••${m.replace(/\D/g, "").slice(-4)}`);
}

export const TABS = ["held", "slip", "escalated", "reported", "open"] as const;
export type Tab = (typeof TABS)[number];

// Fixed SQL fragments, never user input.
const TAB_WHERE: Record<Tab, string> = {
  held: "r.status = 'held'",
  slip: "r.status in ('open','held','frozen') and r.trust_level = 'unverified' and exists (select 1 from request_slips s where s.request_id = r.id)",
  escalated: "r.status = 'open' and r.escalated",
  reported: "(r.status = 'frozen' or (r.report_count > 0 and r.status in ('open','held')))",
  open: "r.status = 'open'",
};

export type QueueRow = {
  id: string; code: string; group: string; component: string; units: number; hospital: string; city: string;
  status: string; trust: string; createdAt: string; confirmed: number; alerted: number; reports: number;
};

export async function loadQueues(tab: Tab): Promise<{ counts: Record<Tab, number>; rows: QueueRow[] }> {
  const countSql = TABS.map((t) => `(select count(*)::int from requests r where ${TAB_WHERE[t]}) as ${t}`).join(", ");
  const [counts, rows] = await asCoordinator((sql) => [
    sql.query(`select ${countSql}`) as Query,
    sql.query(`
      select r.id, r.public_slug, r.abo, r.rh, r.is_bombay, r.component, r.units, r.status, r.trust_level, r.created_at,
             r.report_count, h.name as hospital, h.city,
             (select count(*)::int from confirmations c where c.request_id = r.id) as confirmed,
             (select count(*)::int from alerts a where a.request_id = r.id) as alerted
      from requests r join hospitals h on h.id = r.hospital_id
      where ${TAB_WHERE[tab]} order by r.created_at desc limit 100`) as Query,
  ]);
  return {
    counts: counts[0] as Record<Tab, number>,
    rows: rows.map((r) => ({
      id: r.id as string, code: requestCode(r.public_slug as string), group: groupFromDb(r as never), component: r.component as string,
      units: r.units as number, hospital: r.hospital as string, city: r.city as string, status: r.status as string,
      trust: r.trust_level as string, createdAt: String(r.created_at),
      confirmed: r.confirmed as number, alerted: r.alerted as number, reports: r.report_count as number,
    })),
  };
}

export async function loadRequestDetail(id: string) {
  const [[r], alerts, confirmations, audit] = await asCoordinator((sql) => [
    sql`select r.*, h.name as hospital, h.city,
               exists (select 1 from request_slips s where s.request_id = r.id) as has_slip
        from requests r join hospitals h on h.id = r.hospital_id where r.id = ${id}`,
    sql`select a.wave, a.sent_at, a.response, split_part(d.name, ' ', 1) as first_name, d.is_synthetic
        from alerts a join donors d on d.id = a.donor_id where a.request_id = ${id} order by a.wave, a.sent_at`,
    sql`select c.eta_bucket, c.requester_marked_arrived, c.donor_said_donated, split_part(d.name, ' ', 1) as first_name
        from confirmations c join donors d on d.id = c.donor_id where c.request_id = ${id} order by c.created_at`,
    sql`select l.actor, l.action, l.at, co.name as coordinator
        from audit_log l left join coordinators co on co.id::text = l.actor where l.request_id = ${id} order by l.at desc limit 100`,
  ]);
  if (!r) return null;
  return {
    id: r.id as string, code: requestCode(r.public_slug as string), slug: r.public_slug as string, group: groupFromDb(r as never),
    component: r.component as string, units: r.units as number, status: r.status as string, trust: r.trust_level as string,
    patientLabel: (r.patient_label as string | null) ?? null, hospital: r.hospital as string, city: r.city as string,
    neededBy: String(r.needed_by), expiresAt: String(r.expires_at), createdAt: String(r.created_at),
    currentWave: r.current_wave as number, escalated: r.escalated as boolean, reports: r.report_count as number,
    isCritical: r.is_critical as boolean, hasSlip: r.has_slip as boolean,
    alerts: alerts.map((a) => ({ wave: a.wave as number, sentAt: String(a.sent_at), response: a.response as string, firstName: a.first_name as string, synthetic: a.is_synthetic as boolean })),
    confirmations: confirmations.map((c) => ({ eta: (c.eta_bucket as string | null) ?? "none", arrived: c.requester_marked_arrived as boolean, donated: c.donor_said_donated as boolean | null, firstName: c.first_name as string })),
    audit: audit.map((a) => ({ who: actorLabel(a.actor as string, a.coordinator as string | null), action: a.action as string, at: String(a.at) })),
  };
}
export type RequestDetail = NonNullable<Awaited<ReturnType<typeof loadRequestDetail>>>;

/** Coordinator name, "system", "public", or a masked WhatsApp number. Never a full phone number. */
function actorLabel(actor: string, coordinatorName: string | null): string {
  return coordinatorName ?? maskDigits(actor);
}

export type MessageRow = { id: string; at: string; direction: string; channel: string; kind: string; to: string; code: string | null; text: string };

export async function loadMessages(code?: string): Promise<MessageRow[]> {
  const prefix = code?.trim().toUpperCase().match(/^DH-([A-Z0-9]{4})$/)?.[1]?.toLowerCase() ?? "";
  const [rows] = await asCoordinator((sql) => [
    sql`select m.id, m.created_at, m.direction, m.channel, m.kind, m.wa_id, m.body, r.public_slug
        from message_log m left join requests r on r.id = m.request_id
        where ${prefix} = '' or lower(r.public_slug) like ${prefix + "%"}
        order by m.id desc limit 150`,
  ]);
  return rows.map((m) => ({
    id: String(m.id), at: String(m.created_at), direction: m.direction as string, channel: m.channel as string, kind: m.kind as string,
    to: maskDigits(m.wa_id as string), code: m.public_slug ? requestCode(m.public_slug as string) : null,
    text: maskDigits(JSON.stringify(m.body)).slice(0, 400),
  }));
}

export async function loadAuditLog() {
  const [rows] = await asCoordinator((sql) => [
    sql`select l.actor, l.action, l.at, r.public_slug, co.name as coordinator
        from audit_log l left join requests r on r.id = l.request_id left join coordinators co on co.id::text = l.actor
        order by l.at desc limit 200`,
  ]);
  return rows.map((a) => ({
    who: actorLabel(a.actor as string, a.coordinator as string | null), action: a.action as string, at: String(a.at),
    code: a.public_slug ? requestCode(a.public_slug as string) : null,
  }));
}

export async function loadHospitals(q: string) {
  const term = q.trim();
  const [rows] = await asCoordinator((sql) => [
    sql`select name, city, has_apheresis from hospitals
        where ${term} = '' or name ilike ${"%" + term + "%"} or city ilike ${"%" + term + "%"} order by city, name limit 50`,
  ]);
  return rows.map((h) => ({ name: h.name as string, city: h.city as string, apheresis: h.has_apheresis as boolean }));
}

export type ReferralLeader = { donorId: string; firstName: string; city: string; joined: number; donated: number; consent: boolean | null; asked: boolean };

/** Top referrers per city through referral_leaders() (0010): first name, nearest city and counts only. */
export async function loadReferralLeaders(): Promise<ReferralLeader[]> {
  const [rows] = await asCoordinator((sql) => [sql`select * from referral_leaders() order by city, donated desc, referred desc`]);
  return rows.map((r) => ({
    donorId: r.donor_id as string, firstName: r.first_name as string, city: r.city as string, joined: r.referred as number,
    donated: r.donated as number, consent: r.consent as boolean | null, asked: r.asked_at !== null,
  }));
}

/** The slip photo for review (PRD 10.5). Content type is limited to jpeg/png/webp by a table check. */
export async function loadSlip(requestId: string): Promise<{ bytes: Buffer; type: string } | null> {
  const [[s]] = await asCoordinator((sql) => [
    sql`select encode(content, 'base64') as b64, content_type from request_slips where request_id = ${requestId}`,
  ]);
  return s ? { bytes: Buffer.from(s.b64 as string, "base64"), type: s.content_type as string } : null;
}

export async function loadSystemStatus() {
  const [[s]] = await asCoordinator((sql) => [
    sql`select (select count(*)::int from hospitals) as hospitals,
               (select count(*)::int from requests where status = 'open') as open_requests,
               (select count(*)::int from message_log where created_at > now() - interval '24 hours') as messages_24h,
               (select count(*)::int from message_log where kind = 'send_failed' and created_at > now() - interval '24 hours') as failed_24h,
               (select max(created_at) from message_log where direction = 'in' and channel = 'whatsapp') as last_inbound`,
  ]);
  return {
    hospitals: s.hospitals as number, openRequests: s.open_requests as number, messages24h: s.messages_24h as number,
    failed24h: s.failed_24h as number, lastInbound: s.last_inbound ? String(s.last_inbound) : null,
  };
}
