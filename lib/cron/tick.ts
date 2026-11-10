// PRD 12: runs every minute (cron-job.org calls /api/cron/tick). Order matters: close what is over first,
// so a stale request never gets a wave or a ping.
import { db } from "../db";
import { closeRequest } from "../matching/close";
import { advanceRequest } from "../matching/dispatch";
import { requestCode } from "../requests/slug";
import { sendReply } from "../wa/send";
import { buildTemplate, PAYLOADS } from "../wa/templates";

export async function tick(now = new Date()) {
  const sql = db();
  const done = { expired: 0, noReply: 0, checks: 0, pings: 0, followups: 0 };

  // 1. Past expires_at (PRD 7.3).
  for (const r of await sql`select id from requests where status = 'open' and expires_at < now()`) {
    if (await closeRequest(r.id, "expired")) done.expired++;
  }
  // 2. No answer 2 h after a "Still needed?" ping (PRD 7.3).
  for (const r of await sql`select id from requests where status = 'open' and awaiting_still_needed_since < now() - interval '2 hours'`) {
    if (await closeRequest(r.id, "expired")) done.noReply++;
  }
  // 3. Due wave checks. Claiming by clearing next_check_at is atomic, so overlapping ticks never double-send (PRD 7.2).
  for (const r of await sql`update requests set next_check_at = null where status = 'open' and next_check_at <= now() returning id`) {
    await advanceRequest(r.id, now);
    done.checks++;
  }
  // 4. Every 6 h while open: ask the requester if blood is still needed (PRD 7.3).
  // ponytail: the ping is marked sent before delivery; a failed send still starts the 2 h clock.
  const pings = await sql`
    update requests set last_status_ping_at = now(), awaiting_still_needed_since = coalesce(awaiting_still_needed_since, now())
    where status = 'open' and coalesce(last_status_ping_at, created_at) < now() - interval '6 hours'
    returning id, public_slug, requester_wa_id, lang`;
  for (const p of pings) {
    const [{ n }] = await sql`select count(*)::int as n from confirmations where request_id = ${p.id}`;
    const code = requestCode(p.public_slug);
    const sent = await sendReply(
      { waId: p.requester_wa_id, isSynthetic: false, lang: p.lang },
      {
        type: "buttons",
        key: "statusPing",
        params: { code, count: String(n) },
        buttons: [
          { id: `STILL_NEEDED:${p.id}`, label: "buttons.stillNeeded" },
          { id: `FULFILLED:${p.id}`, label: "buttons.fulfilled" },
          { id: `CANCEL:${p.id}`, label: "buttons.cancelRequest" },
        ],
      },
      { requestId: p.id, fallback: buildTemplate("request_status", p.lang, { request_code: code, confirmed_count: String(n) }, PAYLOADS.request_status(p.id)) },
    );
    if (sent) done.pings++;
  }
  // 5. Follow-up 2 h after needed_by for each confirmed donor, once (PRD 12). Recognition (M8) uses the answer.
  const followups = await sql`
    update confirmations c set followup_sent_at = now()
    from requests q, donors d, hospitals h
    where q.id = c.request_id and d.id = c.donor_id and h.id = q.hospital_id
      and c.followup_sent_at is null and c.donor_said_donated is null and q.status <> 'cancelled'
      and q.needed_by < now() - interval '2 hours'
    returning c.request_id, q.public_slug, h.name as hospital, d.wa_id, d.lang, d.is_synthetic`;
  for (const f of followups) {
    const code = requestCode(f.public_slug);
    const sent = await sendReply(
      { waId: f.wa_id, isSynthetic: f.is_synthetic, lang: f.lang },
      {
        type: "buttons",
        key: "followup",
        params: { hospital: f.hospital, code },
        buttons: [
          { id: `DONATED_YES:${f.request_id}`, label: "buttons.donatedYes" },
          { id: `DONATED_NO:${f.request_id}`, label: "buttons.donatedNo" },
        ],
      },
      { requestId: f.request_id, fallback: buildTemplate("request_followup", f.lang, { hospital: f.hospital, request_code: code }, PAYLOADS.request_followup(f.request_id)) },
    );
    if (sent) done.followups++;
  }
  return done;
}
