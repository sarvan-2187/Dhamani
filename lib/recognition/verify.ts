// PRD 11: a donation is verified when the donor tapped DONATED_YES and the family marked them Arrived, in either
// order. Then: outcome message, certificate PDF as a WhatsApp document, tier. Certificates also stay on /me.
import { db } from "../db";
import { maskPhone } from "../safety/mask";
import { adapterFor } from "../wa/adapter";
import { formatDate, waTranslator } from "../wa/i18n";
import { sendReply } from "../wa/send";
import { logMessage } from "../wa/store";
import type { Lang } from "../wa/types";
import { requestCode } from "../requests/slug";
import { buildCertificate } from "./certificate";
import { CERT_NAME_RE, signMeToken, TIERS } from "./rules";

/** Call after either side confirms. Verifies once; returns true only for the call that verified it. */
export async function verifyIfReady(confirmationId: string): Promise<boolean> {
  const sql = db();
  const [c] = await sql`
    update confirmations set verified_at = now()
    where id = ${confirmationId} and verified_at is null and donor_said_donated and requester_marked_arrived
    returning donor_id, request_id`;
  if (!c) return false;
  // The donation interval (PRD 6.5) starts on the donation day: the day blood was needed, or today if earlier.
  await sql`
    update donors d set last_donated_on = greatest(coalesce(d.last_donated_on, x.day), x.day)
    from (select least((q.needed_by at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date) as day
          from requests q where q.id = ${c.request_id}) x
    where d.id = ${c.donor_id}`;
  await sql`insert into audit_log (actor, action, request_id) values ('system', 'donation_verified', ${c.request_id})`;

  const x = await load(confirmationId);
  if (x) {
    const to = { waId: x.waId, isSynthetic: x.isSynthetic, lang: x.lang };
    const count = String(x.verifiedCount);
    await sendReply(to, { type: "text", key: "donationVerified", params: { code: x.code, hospital: x.hospital, count } }, { requestId: x.requestId });
    if ((TIERS as readonly number[]).includes(x.verifiedCount)) {
      const t = waTranslator(x.lang) as unknown as (k: string) => string;
      await sendReply(to, { type: "text", key: "tierReached", params: { tier: t("tierName"), count } }, { requestId: x.requestId });
    }
    await deliverCertificate(confirmationId);
  }
  return true;
}

type Loaded = {
  requestId: string; waId: string; isSynthetic: boolean; lang: Lang; name: string; certificateName: string | null;
  code: string; hospital: string; date: string; verifiedCount: number;
};

async function load(confirmationId: string): Promise<Loaded | null> {
  const [r] = await db()`
    select c.request_id, c.verified_at, d.wa_id, d.is_synthetic, d.lang, d.name, d.certificate_name, q.public_slug,
           h.name as hospital,
           (select count(*)::int from confirmations v where v.donor_id = d.id and v.verified_at is not null) as verified_count
    from confirmations c join donors d on d.id = c.donor_id join requests q on q.id = c.request_id
         join hospitals h on h.id = q.hospital_id
    where c.id = ${confirmationId} and c.verified_at is not null`;
  if (!r) return null;
  return {
    requestId: r.request_id, waId: r.wa_id, isSynthetic: r.is_synthetic, lang: r.lang, name: r.name,
    certificateName: r.certificate_name, code: requestCode(r.public_slug), hospital: r.hospital,
    date: formatDate(new Date(r.verified_at), "en"), verifiedCount: r.verified_count,
  };
}

/** The name to print: the English spelling the donor gave, or their name if it is already in English letters. */
export const printableName = (x: { name: string; certificateName: string | null }) =>
  x.certificateName ?? (CERT_NAME_RE.test(x.name.trim()) ? x.name.trim() : null);

async function pdfFor(x: Loaded): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const name = printableName(x);
  if (!name) return null;
  return { bytes: await buildCertificate({ name, date: x.date, centre: x.hospital, code: x.code }), filename: `Dhamani-certificate-${x.code}.pdf` };
}

/** The PDF for one verified confirmation, or null if it is not verified or the name is not printable yet. */
export async function certificateFor(confirmationId: string) {
  const x = await load(confirmationId);
  return x ? pdfFor(x) : null;
}

/** Sends the certificate as a WhatsApp document, or first asks for an English spelling of the name. */
export async function deliverCertificate(confirmationId: string): Promise<boolean> {
  const x = await load(confirmationId);
  if (!x) return false;
  const cert = await pdfFor(x);
  if (!cert) {
    await askCertificateName(x);
    return false;
  }
  const t = waTranslator(x.lang) as unknown as (k: string, p?: Record<string, string>) => string;
  try {
    await adapterFor({ waId: x.waId, isSynthetic: x.isSynthetic }).sendDocument(
      x.waId,
      { bytes: cert.bytes, filename: cert.filename, mimeType: "application/pdf", caption: t("certificateCaption", { code: x.code }) },
      { requestId: x.requestId },
    );
  } catch (e) {
    // Usually the 24 h window closed. The certificate stays on /me, and STATUS resends pending ones.
    const error = (e as Error).message;
    console.error(`certificate send failed for ${maskPhone(x.waId)}: ${error}`);
    await logMessage({ direction: "out", waId: x.waId, channel: "whatsapp", kind: "send_failed", body: { error }, requestId: x.requestId }).catch(() => {});
    return false;
  }
  await db()`update confirmations set certificate_sent_at = now() where id = ${confirmationId}`;
  return true;
}

/** Asks for the name in English letters, unless the donor is in the middle of another flow (onboarding). */
async function askCertificateName(x: Loaded) {
  const rows = await db()`
    insert into wa_conversations (wa_id, flow, step, data, updated_at) values (${x.waId}, 'cert_name', 'ask', '{}'::jsonb, now())
    on conflict (wa_id) do update set flow = 'cert_name', step = 'ask', data = '{}'::jsonb, updated_at = now()
    where wa_conversations.flow is null or wa_conversations.flow = 'cert_name'
    returning wa_id`;
  if (rows.length) await sendReply({ waId: x.waId, isSynthetic: x.isSynthetic, lang: x.lang }, { type: "text", key: "certNameAsk" }, { requestId: x.requestId });
}

/** Saves the English spelling, then sends every certificate still waiting for it. */
export async function saveCertificateName(waId: string, name: string): Promise<void> {
  await db()`update donors set certificate_name = ${name} where wa_id = ${waId}`;
  await sendPendingCertificates(waId);
}

/** Every verified donation of this donor whose certificate has not reached WhatsApp yet. */
export async function sendPendingCertificates(waId: string): Promise<number> {
  const rows = await db()`
    select c.id from confirmations c join donors d on d.id = c.donor_id
    where d.wa_id = ${waId} and c.verified_at is not null and c.certificate_sent_at is null order by c.verified_at`;
  let sent = 0;
  for (const r of rows) if (await deliverCertificate(r.id)) sent++;
  return sent;
}

/** The donor's /me link (PRD 8.2), signed for 24 h. */
export function meLink(donorId: string, now = new Date()): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (at least 32 characters)");
  const base = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
  return `${base}/me?t=${signMeToken(donorId, now, secret)}`;
}
