// PRD 9.5: what happens when a donor taps Donate / Not this time, answers the pre-screen and ETA, or a requester
// answers the status ping, or a donor answers the follow-up. Returns the replies for the person who tapped.
import { db } from "../db";
import { verifyIfReady } from "../recognition/verify";
import { requestCode } from "../requests/slug";
import type { AlertAction } from "../wa/flows/alerts";
import type { Reply } from "../wa/flows/reply";
import { closeRequest } from "./close";
import { RESPONSE_WINDOW_MS, updateResponsiveness } from "./score";
import { isTargetReached } from "./waves";

const text = (key: string, params?: Record<string, string>): Reply => ({ type: "text", key, params });

/** Record the donor's answer to an alert once, and update responsiveness (EMA, PRD 7.1). */
async function markResponse(alert: { id: string; sent_at: string; donor_id: string }, response: "donate" | "not_now" | "deferred", now: Date) {
  const sql = db();
  const rows = await sql`
    update alerts set response = ${response}, responded_at = ${now.toISOString()}
    where id = ${alert.id} and response = 'none' returning id`;
  if (!rows.length) return;
  const within = now.getTime() - new Date(alert.sent_at).getTime() <= RESPONSE_WINDOW_MS;
  const [d] = await sql`select responsiveness::float8 as r from donors where id = ${alert.donor_id}`;
  await sql`update donors set responsiveness = ${updateResponsiveness(Number(d.r), within)} where id = ${alert.donor_id}`;
}

export async function respondToAlert(waId: string, a: AlertAction, now = new Date()): Promise<Reply[]> {
  const sql = db();
  if (a.kind === "keep_on") {
    await sql`update donors set paused_until = null where wa_id = ${waId}`;
    return [text("keepOnThanks")];
  }

  const [r] = await sql`
    select r.id, r.public_slug, r.status, r.units, r.requester_wa_id, h.name as hospital, h.address,
           st_y(h.geog::geometry) as lat, st_x(h.geog::geometry) as lng
    from requests r join hospitals h on h.id = r.hospital_id where r.id = ${a.requestId}`;
  if (!r) return [text("unknown")];
  const code = requestCode(r.public_slug);
  const open = r.status === "open";

  // Requester answers to the 6-hourly status ping (PRD 7.3).
  if (a.kind === "still_needed" || a.kind === "fulfilled" || a.kind === "cancel") {
    if (waId !== r.requester_wa_id) return [text("unknown")];
    if (a.kind === "still_needed") {
      await sql`update requests set awaiting_still_needed_since = null where id = ${r.id} and status = 'open'`;
      return [text(open ? "stillNeededThanks" : "requestClosedOwner", { code })];
    }
    await closeRequest(r.id, a.kind === "fulfilled" ? "fulfilled" : "cancelled", { actor: waId });
    return [text("requestClosedOwner", { code })];
  }

  const [alert] = (await sql`
    select a.id, a.sent_at, a.donor_id from alerts a join donors d on d.id = a.donor_id
    where a.request_id = ${r.id} and d.wa_id = ${waId}`) as { id: string; sent_at: string; donor_id: string }[];

  if (a.kind === "donated") {
    const rows = await sql`
      update confirmations c set donor_said_donated = ${a.yes}
      from donors d where d.id = c.donor_id and c.request_id = ${r.id} and d.wa_id = ${waId} returning c.id`;
    if (!rows.length) return [text("unknown")];
    // If the family already marked them arrived, this verifies the donation and sends its own messages (PRD 11).
    if (a.yes && (await verifyIfReady(rows[0].id))) return [];
    return [text(a.yes ? "donatedYesThanks" : "donatedNoThanks")];
  }
  if (!alert) return [text("unknown")];

  switch (a.kind) {
    case "not_now":
      await markResponse(alert, "not_now", now);
      return [text("notNowThanks")];
    case "donate":
      if (!open) return [text("alreadyCovered")];
      return [
        {
          type: "buttons",
          key: "prescreen",
          buttons: [
            { id: `PRE:clear:${r.id}`, label: "buttons.noneOfThese" },
            { id: `PRE:one:${r.id}`, label: "buttons.oneApplies" },
          ],
        },
      ];
    case "prescreen":
      if (!a.clear) {
        await markResponse(alert, "deferred", now); // only the outcome is kept, never which item applied
        return [text("deferredThanks")];
      }
      if (!open) return [text("alreadyCovered")];
      return [
        {
          type: "buttons",
          key: "askEta",
          buttons: [
            { id: `ETA:lt30:${r.id}`, label: "buttons.etaLt30" },
            { id: `ETA:30to60:${r.id}`, label: "buttons.eta30to60" },
            { id: `ETA:gt60:${r.id}`, label: "buttons.etaGt60" },
          ],
        },
      ];
    case "eta": {
      if (!open) return [text("alreadyCovered")];
      await sql`
        insert into confirmations (request_id, donor_id, eta_bucket) values (${r.id}, ${alert.donor_id}, ${a.bucket})
        on conflict (request_id, donor_id) do update set eta_bucket = excluded.eta_bucket`;
      await markResponse(alert, "donate", now);
      const [{ n }] = await sql`select count(*)::int as n from confirmations where request_id = ${r.id}`;
      // Target reached: close now, so no further alerts go out for this request (PRD 7.2).
      if (isTargetReached(r.units, n)) await closeRequest(r.id, "fulfilled", { skipDonorWaId: waId });
      return [
        text("confirmed", {
          code,
          hospital: r.hospital,
          address: r.address,
          directions: `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`,
          family: r.requester_wa_id,
        }),
      ];
    }
  }
}
