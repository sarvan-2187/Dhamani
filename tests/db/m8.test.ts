// M8 "done when": the certificate arrives on WhatsApp after both confirmations. Against the real database;
// synthetic numbers only; WA_ALLOWLIST is cleared so nothing here can reach a real phone.
// Note: daily() is the real retention job, so it also applies the retention rules to old real rows.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neon } from "@neondatabase/serverless";
import { daily } from "../../lib/cron/daily";
import { respondToAlert } from "../../lib/matching/respond";
import { verifyMeToken } from "../../lib/recognition/rules";
import { certificateFor, verifyIfReady } from "../../lib/recognition/verify";
import { handleInbound } from "../../lib/wa/flows/handle";

const sql = neon(process.env.DATABASE_URL!);
const R = "910000000968";
const LATIN = "910000000967"; // name already in English letters
const TAMIL = "910000000966"; // name in Tamil script: asked for an English spelling
const OLD = "910000000965"; // retention and eligible_again cases
let hospitalId = "";

async function cleanup() {
  const ids = (await sql`select id from requests where requester_wa_id = ${R}`).map((r) => r.id);
  await sql`delete from message_log where request_id = any(${ids}::uuid[]) or wa_id in (${R}, ${LATIN}, ${TAMIL}, ${OLD})`;
  await sql`delete from audit_log where request_id = any(${ids}::uuid[])`;
  await sql`delete from requests where requester_wa_id = ${R}`;
  await sql`delete from donors where wa_id in (${LATIN}, ${TAMIL}, ${OLD})`;
  await sql`delete from wa_conversations where wa_id in (${LATIN}, ${TAMIL}, ${OLD})`;
}

async function donor(wa: string, name: string, lastDonatedOn: string | null = null) {
  await sql`
    insert into donors (wa_id, name, lang, abo, rh, dob, sex, weight_band, home_geog, radius_km, consent_version, is_synthetic,
                        last_donated_on)
    select ${wa}, ${name}, 'en', 'O', 'pos', '1990-01-01', 'male', '55_plus', geog, 10, 'test', true, ${lastDonatedOn}
    from hospitals where id = ${hospitalId}`;
}

/** A request this donor confirmed for, with needed_by in the past (the follow-up stage). */
async function confirmed(wa: string): Promise<{ requestId: string; confirmationId: string }> {
  const [r] = await sql`
    insert into requests (public_slug, requester_wa_id, hospital_id, patient_label, abo, rh, component, units, needed_by,
                          expires_at, status, current_wave)
    values (${`m8${Math.random().toString(36).slice(2, 8)}`}, ${R}, ${hospitalId}, 'Ravi K.', 'O', 'pos', 'whole_blood', 1,
            now() - interval '3 hours', now() + interval '1 hour', 'fulfilled', 1)
    returning id`;
  const [c] = await sql`
    insert into confirmations (request_id, donor_id, eta_bucket, followup_sent_at)
    select ${r.id}, id, 'lt30', now() from donors where wa_id = ${wa}
    returning id`; // follow-up already sent, so a parallel cron tick (m6 test) leaves it alone
  return { requestId: r.id, confirmationId: c.id };
}
/** Messages sent to this donor; only those about one request when given (other test files alert these donors too). */
const out = async (wa: string, requestId?: string) =>
  (await sql`select kind, body from message_log where wa_id = ${wa} and direction = 'out'
             and (${requestId ?? null}::uuid is null or request_id = ${requestId ?? null}::uuid) order by id`).map((m) => ({
    kind: m.kind as string,
    text: JSON.stringify(m.body),
  }));

beforeAll(async () => {
  process.env.SIMULATION_MODE = "true";
  process.env.WA_ALLOWLIST = "";
  process.env.SESSION_SECRET ||= "s".repeat(32);
  process.env.APP_BASE_URL = "https://dhamani.test";
  [{ id: hospitalId }] = await sql`select id from hospitals where name = 'DEV ONLY Test Hospital A'`;
  await cleanup();
  await donor(LATIN, "Sarvan");
  await donor(TAMIL, "ரவி");
});
afterAll(cleanup);

describe("two-party verification (PRD 11)", () => {
  it("family first, then the donor's yes: verified, interval starts, certificate sent as a document", async () => {
    const { requestId, confirmationId } = await confirmed(LATIN);
    await sql`update confirmations set requester_marked_arrived = true where id = ${confirmationId}`;
    expect(await verifyIfReady(confirmationId)).toBe(false); // the donor has not said yes yet

    expect(await respondToAlert(LATIN, { kind: "donated", yes: true, requestId })).toEqual([]); // verification replies itself
    const [c] = await sql`select verified_at, certificate_sent_at from confirmations where id = ${confirmationId}`;
    expect(c.verified_at).not.toBeNull();
    expect(c.certificate_sent_at).not.toBeNull();
    const [d] = await sql`select last_donated_on is not null as set from donors where wa_id = ${LATIN}`;
    expect(d.set).toBe(true);

    const msgs = await out(LATIN, requestId);
    expect(msgs.map((o) => o.kind)).toEqual(["text", "text", "document"]); // verified, badge, certificate
    expect(msgs[0].text).toContain("is verified");
    expect(msgs[1].text).toContain("Lifegiver 1");
    expect(msgs[2].text).toContain("Dhamani-certificate-DH-");
    expect(await verifyIfReady(confirmationId)).toBe(false); // once only

    const pdf = await certificateFor(confirmationId);
    expect(Buffer.from(pdf!.bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("a name in Tamil script: asks for an English spelling, then sends the certificate", async () => {
    const { requestId, confirmationId } = await confirmed(TAMIL);
    await respondToAlert(TAMIL, { kind: "donated", yes: true, requestId }); // donor first
    await sql`update confirmations set requester_marked_arrived = true where id = ${confirmationId}`;
    expect(await verifyIfReady(confirmationId)).toBe(true); // then the family

    expect((await out(TAMIL, requestId)).map((o) => o.kind)).not.toContain("document");
    const [conv] = await sql`select flow from wa_conversations where wa_id = ${TAMIL}`;
    expect(conv.flow).toBe("cert_name");

    await handleInbound({ id: "m8-name", from: TAMIL, at: new Date(), kind: "text", text: "Ravi K", rawType: "text" });
    const [d] = await sql`select certificate_name from donors where wa_id = ${TAMIL}`;
    expect(d.certificate_name).toBe("Ravi K");
    expect((await out(TAMIL, requestId)).at(-1)?.kind).toBe("document");
    const [after] = await sql`select flow from wa_conversations where wa_id = ${TAMIL}`;
    expect(after.flow).toBeNull();
  });

  it("STATUS sends a signed /me link that opens this donor's page", async () => {
    await handleInbound({ id: "m8-status", from: LATIN, at: new Date(), kind: "text", text: "STATUS", rawType: "text" });
    const all = (await out(LATIN)).map((o) => o.text).join(" "); // STATUS also sends the invite link (referrals)
    const token = /\/me\?t=([0-9a-f-]{36}\.\d+\.[A-Za-z0-9_-]{43})/.exec(all)?.[1];
    const [d] = await sql`select id from donors where wa_id = ${LATIN}`;
    expect(verifyMeToken(token, new Date(), process.env.SESSION_SECRET!)).toBe(d.id);
  });
});

describe("daily job (PRD 12)", () => {
  it("applies retention, sends eligible_again once, and deletes stopped donors after 7 days", async () => {
    const istDay = (daysAgo: number) => new Date(Date.now() + 330 * 60_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);
    await donor(OLD, "Old Donor", istDay(91)); // male: 90 days, so the interval ended yesterday
    const { requestId } = await confirmed(OLD);
    await sql`update requests set status = 'expired', closed_at = now() - interval '31 days' where id = ${requestId}`;
    await sql`insert into request_slips (request_id, content, content_type) values (${requestId}, '\\x00'::bytea, 'image/png')`;

    await daily();
    const [r] = await sql`select patient_label from requests where id = ${requestId}`;
    expect(r.patient_label).toBeNull();
    const [{ n }] = await sql`select count(*)::int as n from request_slips where request_id = ${requestId}`;
    expect(n).toBe(0);
    const eligible = async () => (await out(OLD)).filter((o) => o.text.includes("interval ended")).length;
    expect(await eligible()).toBe(1);

    await daily(); // a second run the same day sends nothing new
    expect(await eligible()).toBe(1);

    await sql`update donors set stopped_at = now() - interval '8 days' where wa_id = ${OLD}`;
    await daily();
    const [{ left }] = await sql`select count(*)::int as left from donors where wa_id = ${OLD}`;
    expect(left).toBe(0);
  });
});
