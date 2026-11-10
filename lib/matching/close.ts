// PRD 7.2 / 7.3: closing a request stops all pending work (next_check_at cleared, status no longer open, and the
// sender refuses non-open requests) and tells each confirmed donor the outcome.
import { db } from "../db";
import { requestCode } from "../requests/slug";
import { sendReply } from "../wa/send";

export type CloseStatus = "fulfilled" | "expired" | "cancelled";

/** Returns false if the request was already closed (so outcomes are sent once). */
export async function closeRequest(requestId: string, status: CloseStatus, opts: { skipDonorWaId?: string; actor?: string } = {}): Promise<boolean> {
  const sql = db();
  const rows = await sql`
    update requests set status = ${status}, closed_at = now(), next_check_at = null, awaiting_still_needed_since = null
    where id = ${requestId} and status in ('open', 'held', 'frozen') returning public_slug`;
  if (!rows.length) return false;
  await sql`insert into audit_log (actor, action, request_id) values (${opts.actor ?? "system"}, ${`closed_${status}`}, ${requestId})`;

  const code = requestCode(rows[0].public_slug);
  const donors = await sql`
    select d.wa_id, d.lang, d.is_synthetic from confirmations c join donors d on d.id = c.donor_id where c.request_id = ${requestId}`;
  for (const d of donors) {
    if (d.wa_id === opts.skipDonorWaId) continue;
    await sendReply(
      { waId: d.wa_id, isSynthetic: d.is_synthetic, lang: d.lang },
      { type: "text", key: status === "fulfilled" ? "outcomeFulfilled" : "outcomeClosed", params: { code } },
      { requestId },
    );
  }
  return true;
}
