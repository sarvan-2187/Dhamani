// PRD 10.5 / 7.3 coordinator actions on a request. Each one is a guarded state change plus an audit_log row;
// a false return means the request was not in a state that allows it (nothing changed, nothing logged).
import { db } from "../db";
import { closeRequest } from "../matching/close";
import { advanceRequest } from "../matching/dispatch";
import { audit } from "./auth";

export const REQUEST_ACTIONS = ["release", "approve_slip", "verify", "freeze", "unfreeze", "cancel"] as const;
export type RequestAction = (typeof REQUEST_ACTIONS)[number];

export async function runRequestAction(actor: string, requestId: string, action: RequestAction): Promise<boolean> {
  const sql = db();
  let rows: unknown[] = [];
  switch (action) {
    case "release": // held -> open (money-keyword hold cleared), then wave 1 goes out
      rows = await sql`update requests set status = 'open' where id = ${requestId} and status = 'held' returning id`;
      break;
    case "approve_slip":
      rows = await sql`
        update requests set trust_level = 'slip_verified', slip_verified_at = now()
        where id = ${requestId} and trust_level = 'unverified' and exists (select 1 from request_slips s where s.request_id = ${requestId})
        returning id`;
      break;
    case "verify": // after a phone call with the family or the blood centre
      rows = await sql`
        update requests set trust_level = 'coordinator_verified', slip_verified_at = coalesce(slip_verified_at, now())
        where id = ${requestId} and trust_level <> 'coordinator_verified' and status in ('open', 'held', 'frozen') returning id`;
      break;
    case "freeze":
      rows = await sql`update requests set status = 'frozen' where id = ${requestId} and status = 'open' returning id`;
      break;
    case "unfreeze": // waves resume at the next tick
      rows = await sql`
        update requests set status = 'open', next_check_at = now() where id = ${requestId} and status = 'frozen' returning id`;
      break;
    case "cancel": // closeRequest audits and tells confirmed donors
      return closeRequest(requestId, "cancelled", { actor });
  }
  if (!rows.length) return false;
  await audit(actor, `console_${action}`, requestId);
  if (action === "release") await advanceRequest(requestId);
  return true;
}
