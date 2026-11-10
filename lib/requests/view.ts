// PRD 10.3: what the live request page shows. Public: no phone numbers, no patient name; donors by first name
// and ETA only. The requester (signed in with the same WhatsApp number) also sees the owner block.
import { groupFromDb, type BloodGroup, type Component } from "../blood/compat";
import { db } from "../db";
import { targetConfirmations, type RequestStatus } from "../matching/waves";
import { requestCode } from "./slug";

export type Eta = "lt30" | "30to60" | "gt60" | null;

export type RequestView = {
  slug: string;
  code: string;
  status: RequestStatus;
  group: BloodGroup;
  component: Component;
  units: number;
  hospital: { name: string; city: string };
  neededBy: string;
  expiresAt: string;
  confirmed: number;
  target: number;
  donors: { firstName: string; eta: Eta }[];
  isOwner: boolean;
  owner?: {
    patientLabel: string | null;
    alerted: number;
    trustLevel: string;
    hasSlip: boolean;
    confirmations: { id: string; firstName: string; eta: Eta; arrived: boolean }[];
  };
};

export async function loadRequestView(slug: string, viewerWaId: string | null): Promise<RequestView | null> {
  const sql = db();
  const [r] = await sql`
    select r.id, r.public_slug, r.status, r.abo, r.rh, r.is_bombay, r.component, r.units, r.needed_by, r.expires_at,
           r.trust_level, r.requester_wa_id, r.patient_label, h.name as hospital, h.city,
           (select count(*)::int from alerts a where a.request_id = r.id) as alerted,
           exists (select 1 from request_slips s where s.request_id = r.id) as has_slip
    from requests r join hospitals h on h.id = r.hospital_id
    where r.public_slug = ${slug}`;
  if (!r) return null;
  const rows = await sql`
    select c.id, d.name, c.eta_bucket, c.requester_marked_arrived
    from confirmations c join donors d on d.id = c.donor_id
    where c.request_id = ${r.id} order by c.created_at`;
  const firstName = (name: string) => name.trim().split(/\s+/)[0];
  const isOwner = viewerWaId !== null && viewerWaId === r.requester_wa_id;

  return {
    slug: r.public_slug,
    code: requestCode(r.public_slug),
    status: r.status,
    group: groupFromDb(r as never),
    component: r.component,
    units: r.units,
    hospital: { name: r.hospital, city: r.city },
    neededBy: new Date(r.needed_by).toISOString(),
    expiresAt: new Date(r.expires_at).toISOString(),
    confirmed: rows.length,
    target: targetConfirmations(r.units),
    donors: rows.map((c) => ({ firstName: firstName(c.name), eta: c.eta_bucket })),
    isOwner,
    owner: isOwner
      ? {
          patientLabel: r.patient_label,
          alerted: r.alerted,
          trustLevel: r.trust_level,
          hasSlip: r.has_slip,
          confirmations: rows.map((c) => ({ id: c.id, firstName: firstName(c.name), eta: c.eta_bucket, arrived: c.requester_marked_arrived })),
        }
      : undefined,
  };
}
