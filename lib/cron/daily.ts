// PRD 12 daily job (cron-job.org, 03:00 IST): retention first, then the eligible_again messages.
import { DONATION_INTERVAL_DAYS } from "../blood/eligibility";
import { db } from "../db";
import { formatDate } from "../wa/i18n";
import { sendReply } from "../wa/send";
import { buildTemplate, PAYLOADS } from "../wa/templates";

export async function daily() {
  const sql = db();
  const n = async (q: Promise<unknown[]>) => (await q).length;
  const done = {
    // Slips: 7 days after verification, and in any case 30 days after the request closed.
    slips: await n(sql`
      delete from request_slips s using requests r
      where r.id = s.request_id
        and (r.slip_verified_at < now() - interval '7 days' or r.closed_at < now() - interval '30 days')
      returning s.request_id`),
    // Patient first name and initial: 30 days after close.
    patientLabels: await n(sql`
      update requests set patient_label = null
      where patient_label is not null and closed_at < now() - interval '30 days' returning id`),
    // STOP: the profile is deleted 7 days later (PRD 9.6); alerts and confirmations go with it.
    donorsDeleted: await n(sql`delete from donors where stopped_at < now() - interval '7 days' returning wa_id`),
    // Housekeeping: expired sign-in codes and sessions, and idle chat state of people who are not donors.
    expired: await n(sql`
      with a as (delete from login_codes where expires_at < now() - interval '1 day' returning 1),
           b as (delete from web_sessions where expires_at < now() returning 1),
           c as (delete from console_sessions where expires_at < now() returning 1),
           d as (delete from wa_conversations w where w.updated_at < now() - interval '7 days'
                   and not exists (select 1 from donors x where x.wa_id = w.wa_id) returning 1)
      select 1 from a union all select 1 from b union all select 1 from c union all select 1 from d`),
    eligibleAgain: 0,
  };

  // Donors whose donation interval (PRD 6.5) ended yesterday, India time. Claimed atomically, once per interval.
  const due = await sql`
    update donors set eligible_again_sent_at = now()
    where stopped_at is null and (paused_until is null or paused_until < now()) and last_donated_on is not null
      and last_donated_on + (case sex when 'male' then ${DONATION_INTERVAL_DAYS.male}::int
                                      when 'female' then ${DONATION_INTERVAL_DAYS.female}::int
                                      else ${DONATION_INTERVAL_DAYS.other}::int end)
          = (now() at time zone 'Asia/Kolkata')::date - 1
      and (eligible_again_sent_at is null or eligible_again_sent_at < last_donated_on)
    returning wa_id, lang, is_synthetic`;
  for (const d of due) {
    const date = formatDate(new Date(Date.now() - 86_400_000), d.lang);
    const sent = await sendReply(
      { waId: d.wa_id, isSynthetic: d.is_synthetic, lang: d.lang },
      {
        type: "buttons",
        key: "eligibleAgain",
        params: { date },
        buttons: [
          { id: "KEEP_ON", label: "buttons.keepOn" },
          { id: "PAUSE_30", label: "buttons.pause30" },
        ],
      },
      { fallback: buildTemplate("eligible_again", d.lang, { date }, PAYLOADS.eligible_again()) },
    );
    if (sent) done.eligibleAgain++;
  }
  return done;
}
