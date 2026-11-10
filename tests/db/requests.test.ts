// M5 "done when": posting a request fires wave 1, and the polled view (what the live page shows) updates.
// Against the real database; synthetic numbers only; everything is cleaned up.
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neon } from "@neondatabase/serverless";
import { claimLogin, hashIp, startLogin } from "../../lib/auth/login";
import { isQuietHours } from "../../lib/blood/eligibility";
import { createRequest } from "../../lib/requests/create";
import { loadRequestView } from "../../lib/requests/view";
import { POST } from "../../app/api/whatsapp/webhook/route";

const sql = neon(process.env.DATABASE_URL!);
const REQUESTER = "910000000995";
const O_POS = "910000000994"; // compatible, at the hospital
const B_POS = "910000000993"; // incompatible for O+, at the hospital
const TEST_IP = "203.0.113.7";
const SECRET = "db-test-app-secret";
let hospitalId = "";

async function cleanup() {
  const reqs = await sql`select id from requests where requester_wa_id = ${REQUESTER}`;
  const ids = reqs.map((r) => r.id);
  await sql`delete from message_log where request_id = any(${ids}::uuid[]) or wa_id in (${REQUESTER}, ${O_POS}, ${B_POS})`;
  await sql`delete from audit_log where request_id = any(${ids}::uuid[])`;
  await sql`delete from requests where requester_wa_id = ${REQUESTER}`;
  await sql`delete from donors where wa_id in (${O_POS}, ${B_POS})`;
  await sql`delete from login_codes where wa_id = ${REQUESTER} or ip_hash = ${hashIp(TEST_IP)}`;
  await sql`delete from wa_conversations where wa_id = ${REQUESTER}`;
}

async function donorAtHospital(waId: string, abo: string, rh: string) {
  await sql`
    insert into donors (wa_id, name, lang, abo, rh, dob, sex, weight_band, home_geog, radius_km, consent_version, is_synthetic)
    select ${waId}, 'Test', 'en', ${abo}::abo, ${rh}::rh, '1990-01-01', 'male', '55_plus', geog, 10, 'test', true
    from hospitals where id = ${hospitalId}`;
}

const inThreeHours = () => new Date(Date.now() + 3 * 3_600_000).toISOString();
const base = () => ({ hospitalId, patientLabel: "Priya K.", group: "O+", component: "whole_blood", units: 1, neededBy: inThreeHours(), isCritical: false });

beforeAll(async () => {
  process.env.SIMULATION_MODE = "true";
  process.env.WA_APP_SECRET = SECRET;
  [{ id: hospitalId }] = await sql`select id from hospitals where name = 'DEV ONLY Test Hospital A'`;
  await cleanup();
  await donorAtHospital(O_POS, "O", "pos");
  await donorAtHospital(B_POS, "B", "pos");
});
afterAll(cleanup);

describe("posting a request", () => {
  let slug = "";

  it("creates an open request and fires wave 1 to compatible donors only", async () => {
    const r = await createRequest(base(), REQUESTER);
    expect(r).toMatchObject({ ok: true, status: "open" });
    slug = (r as { slug: string }).slug;

    const [req] = await sql`select id, current_wave, extract(epoch from next_check_at - now()) / 60 as mins from requests where public_slug = ${slug}`;
    expect(req.current_wave).toBe(1);
    expect(Number(req.mins)).toBeGreaterThan(19);
    expect(Number(req.mins)).toBeLessThanOrEqual(20);

    const alerted = await sql`
      select d.wa_id, d.abo, d.is_bombay, a.wave, st_distance(d.home_geog, h.geog) / 1000 as km
      from alerts a join donors d on d.id = a.donor_id join requests r on r.id = a.request_id join hospitals h on h.id = r.hospital_id
      where a.request_id = ${req.id}`;
    const ids = alerted.map((a) => a.wa_id);
    if (isQuietHours(new Date())) {
      expect(ids).toEqual([]); // 23:00 to 06:00 IST: a non-critical request alerts nobody (PRD 6.5)
    } else {
      expect(ids).toContain(O_POS);
    }
    expect(ids).not.toContain(B_POS);
    expect(alerted.length).toBeLessThanOrEqual(10);
    for (const a of alerted) {
      expect(a.wave).toBe(1);
      expect(a.abo).toBe("O"); // O+ patient: O+ or O- donors (PRD 6.1)
      expect(a.is_bombay).toBe(false);
      expect(Number(a.km)).toBeLessThanOrEqual(5);
    }

    const sent = await sql`select wa_id, channel from message_log where request_id = ${req.id} and direction = 'out'`;
    expect(sent.map((s) => s.wa_id).sort()).toEqual([...ids].sort());
    expect(sent.every((s) => s.channel === "simulated")).toBe(true);
  });

  it("the polled view shows a new confirmation (what the live page renders every 2 s)", async () => {
    const before = await loadRequestView(slug, null);
    expect(before).toMatchObject({ status: "open", confirmed: 0, target: 2, isOwner: false });
    expect(before?.owner).toBeUndefined();

    await sql`
      insert into confirmations (request_id, donor_id, eta_bucket)
      select r.id, d.id, 'lt30' from requests r, donors d where r.public_slug = ${slug} and d.wa_id = ${O_POS}`;
    const after = await loadRequestView(slug, null);
    expect(after?.confirmed).toBe(1);
    expect(after?.donors).toEqual([{ firstName: "Test", eta: "lt30" }]);
    expect(JSON.stringify(after)).not.toContain(O_POS); // never a phone number

    const ownerView = await loadRequestView(slug, REQUESTER);
    expect(ownerView?.isOwner).toBe(true);
    expect(ownerView?.owner?.patientLabel).toBe("Priya K.");
  });

  it("money words hold the request instead of alerting anyone", async () => {
    const r = await createRequest({ ...base(), patientLabel: "Rupees" }, REQUESTER);
    expect(r).toMatchObject({ ok: true, status: "held" });
    const [n] = await sql`select count(*)::int as n from alerts a join requests r on r.id = a.request_id where r.public_slug = ${(r as { slug: string }).slug}`;
    expect(n.n).toBe(0);
  });

  it("allows at most 2 open requests per person", async () => {
    expect(await createRequest(base(), REQUESTER)).toEqual({ ok: false, error: "too_many_open" });
  });

  it("rejects bad input", async () => {
    const other = "910000000990";
    expect(await createRequest({ ...base(), neededBy: new Date(Date.now() - 60_000).toISOString() }, other)).toEqual({ ok: false, error: "needed_by_past" });
    expect(await createRequest({ ...base(), patientLabel: "Priya Kumari Sharma" }, other)).toEqual({ ok: false, error: "patient_label" });
    expect(await createRequest({ ...base(), units: 11 }, other)).toEqual({ ok: false, error: "invalid" });
  });
});

describe("reverse WhatsApp OTP over the webhook", () => {
  it("LOGIN <code> from WhatsApp signs the browser in, once", async () => {
    const start = await startLogin(TEST_IP);
    if (!start.ok) throw new Error("rate limited");
    expect(await claimLogin(start.nonce)).toEqual({ status: "pending" });

    const body = new TextEncoder().encode(JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "0", changes: [{ field: "messages", value: { messages: [
        { from: REQUESTER, id: `wamid.LOGINTEST.${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: `LOGIN ${start.code}` } },
      ] } }] }],
    }));
    const sig = "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
    const res = await POST(new Request("http://x/api/whatsapp/webhook", { method: "POST", body, headers: { "x-hub-signature-256": sig } }));
    expect(res.status).toBe(200);

    expect(await claimLogin(start.nonce)).toEqual({ status: "confirmed", waId: REQUESTER });
    expect(await claimLogin(start.nonce)).toEqual({ status: "expired" }); // single use
    const [reply] = await sql`select body from message_log where wa_id = ${REQUESTER} and direction = 'out' order by id desc limit 1`;
    expect(JSON.stringify(reply.body)).toContain("You are signed in");
  });
});
