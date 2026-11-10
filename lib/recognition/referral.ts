// Referrals (owner request 2026-11-10). No cash, vouchers or gifts of value: that would make donation remunerated
// (National Blood Policy). Donors get a personal JOIN link; a referral counts once the person they invited has a
// verified donation; coordinators may thank top referrers per city publicly, only after the donor says yes.
import { randomInt } from "node:crypto";
import { db } from "../db";
import { sendReply } from "../wa/send";

export const REF_CODE_RE = /^R[A-Z0-9]{5}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I

export const newReferralCode = () => "R" + Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** The donor's code, created on first use. */
export async function ensureReferralCode(donorId: string): Promise<string> {
  const sql = db();
  for (let i = 0; i < 5; i++) {
    const rows = await sql`
      update donors set referral_code = coalesce(referral_code, ${newReferralCode()}) where id = ${donorId}
      returning referral_code`.catch((e: Error) => {
      if (/unique/i.test(e.message)) return null; // code taken by someone else: try another
      throw e;
    });
    if (rows?.[0]) return rows[0].referral_code as string;
  }
  throw new Error("could not allocate a referral code");
}

/** wa.me link that opens WhatsApp with "JOIN <code>" ready to send to Dhamani. */
export function inviteLink(code: string): string {
  const business = (process.env.WA_BUSINESS_NUMBER ?? "").replace(/\D/g, "");
  return `https://wa.me/${business}?text=${encodeURIComponent(`JOIN ${code}`)}`;
}

/** How many joined with this donor's link, and how many of them have a verified donation. */
export async function referralStats(donorId: string): Promise<{ joined: number; donated: number }> {
  const [r] = await db()`
    select count(*)::int as joined,
           count(*) filter (where exists (select 1 from confirmations c where c.donor_id = d.id and c.verified_at is not null))::int as donated
    from donors d where d.referred_by = ${donorId} and d.stopped_at is null`;
  return { joined: r.joined, donated: r.donated };
}

/** Coordinator action: ask the donor on WhatsApp whether they may be thanked publicly. */
export async function askRecognitionConsent(actor: string, donorId: string): Promise<boolean> {
  const sql = db();
  const [d] = await sql`
    update donors set recognition_asked_at = now() where id = ${donorId} and stopped_at is null
    returning wa_id, lang, is_synthetic`;
  if (!d) return false;
  const { donated } = await referralStats(donorId);
  await sendReply(
    { waId: d.wa_id, isSynthetic: d.is_synthetic, lang: d.lang },
    {
      type: "buttons",
      key: "recognitionAsk",
      params: { count: String(donated) },
      buttons: [
        { id: "RECOG:YES", label: "buttons.recognitionYes" },
        { id: "RECOG:NO", label: "buttons.recognitionNo" },
      ],
    },
  );
  await sql`insert into audit_log (actor, action) values (${actor}, ${`recognition_asked:${donorId}`})`;
  return true;
}

/** The donor's answer. Only counts if a coordinator asked. */
export async function saveRecognitionConsent(waId: string, yes: boolean): Promise<boolean> {
  const rows = await db()`
    update donors set recognition_consent = ${yes} where wa_id = ${waId} and recognition_asked_at is not null returning id`;
  return rows.length > 0;
}
