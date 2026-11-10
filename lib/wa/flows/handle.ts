// Runs one inbound message through the router, persists the outcome, and sends the replies.
// The only place the flows touch the database or WhatsApp.
import { groupFromDb, groupToDb } from "../../blood/compat";
import { db } from "../../db";
import { adapterFor } from "../adapter";
import type { Inbound } from "../types";
import type { OnbState } from "./onboarding";
import { confirmLogin } from "../../auth/login";
import { respondToAlert } from "../../matching/respond";
import { ensureReferralCode, inviteLink, saveRecognitionConsent } from "../../recognition/referral";
import { meLink, saveCertificateName, sendPendingCertificates } from "../../recognition/verify";
import { render, type Reply } from "./reply";
import { route, type ConvView, type DonorView, type Effect } from "./router";

async function load(waId: string): Promise<{ conv: ConvView; donor: DonorView | null }> {
  const sql = db();
  const [convRows, donorRows] = await Promise.all([
    sql`select flow, step, data from wa_conversations where wa_id = ${waId}`,
    sql`select name, lang, abo, rh, is_bombay, sex, to_char(last_donated_on, 'YYYY-MM-DD') as last_donated_on,
               paused_until, stopped_at, consent_version, is_synthetic
        from donors where wa_id = ${waId}`,
  ]);
  const c = convRows[0];
  const d = donorRows[0];
  return {
    conv: c ? { flow: c.flow, step: c.step, data: c.data } : null,
    donor: d
      ? {
          name: d.name,
          lang: d.lang,
          group: groupFromDb(d as { abo: never; rh: never; is_bombay: boolean }),
          sex: d.sex,
          lastDonatedOn: d.last_donated_on,
          pausedUntil: d.paused_until ? new Date(d.paused_until) : null,
          stoppedAt: d.stopped_at ? new Date(d.stopped_at) : null,
          consentVersion: d.consent_version,
          isSynthetic: d.is_synthetic,
        }
      : null,
  };
}

/** Applies one effect; may return replies that depend on the result (login, alert buttons). */
async function applyEffect(waId: string, e: Effect, now: Date): Promise<Reply[] | void> {
  const sql = db();
  switch (e.type) {
    case "login":
      return [{ type: "text", key: (await confirmLogin(e.code, waId)) ? "signedIn" : "loginExpired" }];
    case "alert":
      return respondToAlert(waId, e.action, now);
    case "me_link": {
      const [d] = await sql`select id from donors where wa_id = ${waId} and stopped_at is null`;
      if (!d) return;
      await sendPendingCertificates(waId); // the donor just wrote, so the 24 h window is open
      const invite = inviteLink(await ensureReferralCode(d.id));
      return [
        { type: "text", key: "meLink", params: { link: meLink(d.id, now) } },
        { type: "text", key: "invite", params: { invite } },
      ];
    }
    case "cert_name":
      await saveCertificateName(waId, e.name);
      return;
    case "recognition":
      await saveRecognitionConsent(waId, e.yes);
      return;
    case "save_donor": {
      const d = e.donor;
      const g = groupToDb(d.group);
      // Location is already rounded to about 500 m by the flow. Re-joining after STOP clears stopped_at.
      await sql`
        insert into donors (wa_id, name, lang, abo, rh, is_bombay, dob, sex, weight_band, home_geog, radius_km,
                            last_donated_on, night_ok, rare_registry_opt_in, consent_version, referred_by)
        values (${waId}, ${d.name}, ${d.lang}, ${g.abo}, ${g.rh}, ${g.is_bombay}, ${d.dob}, ${d.sex}, ${d.weightBand},
                st_setsrid(st_makepoint(${d.lng}, ${d.lat}), 4326)::geography, ${d.radiusKm},
                ${d.lastDonatedOn}, ${d.nightOk}, ${d.rareRegistryOptIn}, ${d.consentVersion},
                -- Only on first sign-up, never to themselves; re-joining or UPDATE never changes it.
                (select id from donors where referral_code = ${d.referralCode ?? null} and wa_id <> ${waId}))
        on conflict (wa_id) do update set
          name = excluded.name, lang = excluded.lang, abo = excluded.abo, rh = excluded.rh, is_bombay = excluded.is_bombay,
          dob = excluded.dob, sex = excluded.sex, weight_band = excluded.weight_band, home_geog = excluded.home_geog,
          radius_km = excluded.radius_km, last_donated_on = excluded.last_donated_on, night_ok = excluded.night_ok,
          rare_registry_opt_in = excluded.rare_registry_opt_in, consent_version = excluded.consent_version,
          stopped_at = null`;
      return;
    }
    case "pause":
      await sql`update donors set paused_until = ${e.until.toISOString()} where wa_id = ${waId}`;
      return;
    case "stop":
      await sql`update donors set stopped_at = ${now.toISOString()} where wa_id = ${waId}`;
      return;
  }
}

async function saveConversation(waId: string, state: OnbState | null) {
  await db()`
    insert into wa_conversations (wa_id, flow, step, data, updated_at)
    values (${waId}, ${state ? "onboarding" : null}, ${state?.step ?? null}, ${JSON.stringify(state?.data ?? {})}::jsonb, now())
    on conflict (wa_id) do update set flow = excluded.flow, step = excluded.step, data = excluded.data, updated_at = now()`;
}

export async function handleInbound(m: Inbound, now = new Date()): Promise<void> {
  const { conv, donor } = await load(m.from);
  const out = route(m, conv, donor, now);

  // Persist first, so a failed send never leaves the state behind the conversation.
  for (const e of out.effects) {
    const extra = await applyEffect(m.from, e, now);
    if (extra) out.replies.push(...extra);
  }
  if (out.conv !== "keep") await saveConversation(m.from, out.conv);

  const adapter = adapterFor({ waId: m.from, isSynthetic: donor?.isSynthetic ?? false });
  for (const reply of out.replies) {
    const r = render(reply, out.lang);
    if (r.kind === "text") await adapter.sendText(m.from, r.text);
    else await adapter.sendInteractive(m.from, r.interactive);
  }
}
