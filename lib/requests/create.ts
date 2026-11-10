// PRD 10.2 posting rules: validation, money hold (13), SDP needs apheresis (6.3), max 2 open per requester (13),
// expires_at (7.3). An open request fires wave 1 immediately.
import { z } from "zod";
import { ALL_GROUPS, groupToDb, postingBlockReason } from "../blood/compat";
import { db } from "../db";
import { advanceRequest } from "../matching/dispatch";
import { expiresAt } from "../matching/waves";
import { mentionsMoney } from "../safety/money";
import { PATIENT_LABEL_RE } from "./patient";
import { newSlug } from "./slug";

export const MAX_OPEN_PER_REQUESTER = 2;

export const RequestInput = z.object({
  hospitalId: z.string().uuid(),
  patientLabel: z.string().trim().min(2).max(40),
  group: z.enum(ALL_GROUPS as unknown as [string, ...string[]]),
  component: z.enum(["whole_blood", "prbc", "platelets_rdp", "platelets_sdp", "ffp"]),
  units: z.number().int().min(1).max(10),
  neededBy: z.string().datetime({ offset: true }),
  isCritical: z.boolean(),
});

export type CreateError = "invalid" | "patient_label" | "needed_by_past" | "hospital_not_found" | "needs_apheresis" | "too_many_open";
export type CreateResult = { ok: true; slug: string; status: "open" | "held" } | { ok: false; error: CreateError };

export async function createRequest(
  raw: unknown,
  requesterWaId: string,
  now = new Date(),
  lang: "en" | "ta" | "te" = "en", // the requester's web language, used for their WhatsApp status pings
): Promise<CreateResult> {
  const parsed = RequestInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const input = parsed.data;
  if (!PATIENT_LABEL_RE.test(input.patientLabel)) return { ok: false, error: "patient_label" };
  const neededBy = new Date(input.neededBy);
  if (neededBy.getTime() <= now.getTime()) return { ok: false, error: "needed_by_past" };

  const sql = db();
  const [hospital] = await sql`select id, has_apheresis from hospitals where id = ${input.hospitalId}`;
  if (!hospital) return { ok: false, error: "hospital_not_found" };
  if (postingBlockReason(input.component, { has_apheresis: hospital.has_apheresis === true })) {
    return { ok: false, error: "needs_apheresis" };
  }

  const [{ n }] = await sql`
    select count(*)::int as n from requests where requester_wa_id = ${requesterWaId} and status in ('open', 'held')`;
  if (n >= MAX_OPEN_PER_REQUESTER) return { ok: false, error: "too_many_open" };

  const status = mentionsMoney(input.patientLabel) ? "held" : "open";
  const g = groupToDb(input.group as never);
  let id: string | null = null;
  let slug = "";
  for (let attempt = 0; attempt < 5 && !id; attempt++) {
    slug = newSlug();
    const rows = await sql`
      insert into requests (public_slug, requester_wa_id, hospital_id, patient_label, abo, rh, is_bombay, component, units,
                            needed_by, is_critical, status, expires_at, lang)
      values (${slug}, ${requesterWaId}, ${input.hospitalId}, ${input.patientLabel}, ${g.abo}, ${g.rh}, ${g.is_bombay},
              ${input.component}, ${input.units}, ${neededBy.toISOString()}, ${input.isCritical}, ${status},
              ${expiresAt(neededBy, now).toISOString()}, ${lang})
      on conflict (public_slug) do nothing returning id`;
    id = rows[0]?.id ?? null;
  }
  if (!id) throw new Error("could not allocate a request slug");

  await sql`insert into audit_log (actor, action, request_id) values (${requesterWaId}, ${`request_created_${status}`}, ${id})`;
  if (status === "open") await advanceRequest(id, now); // wave 1 at posting (PRD 7.2)
  return { ok: true, slug, status };
}
