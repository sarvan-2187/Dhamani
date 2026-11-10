// M6 against the real database: the donor reply flow to fulfilment, and the cron tick. Synthetic numbers only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neon } from "@neondatabase/serverless";
import { tick } from "../../lib/cron/tick";
import { advanceRequest } from "../../lib/matching/dispatch";
import { respondToAlert } from "../../lib/matching/respond";
import { createRequest } from "../../lib/requests/create";
import { GET as cronGET } from "../../app/api/cron/tick/route";

const sql = neon(process.env.DATABASE_URL!);
const R = "910000000988";
const D1 = "910000000987";
const D2 = "910000000986";
const D3 = "910000000985";
let hospitalId = "";

async function cleanup() {
  const ids = (await sql`select id from requests where requester_wa_id = ${R}`).map((r) => r.id);
  await sql`delete from message_log where request_id = any(${ids}::uuid[]) or wa_id in (${R}, ${D1}, ${D2}, ${D3})`;
  await sql`delete from audit_log where request_id = any(${ids}::uuid[])`;
  await sql`delete from requests where requester_wa_id = ${R}`;
  await sql`delete from donors where wa_id in (${D1}, ${D2}, ${D3})`;
}

const base = () => ({ hospitalId, patientLabel: "Ravi K.", group: "O+", component: "whole_blood", units: 1, neededBy: new Date(Date.now() + 3 * 3_600_000).toISOString(), isCritical: false });
const idOf = async (slug: string) => (await sql`select id from requests where public_slug = ${slug}`)[0].id as string;

beforeAll(async () => {
  process.env.SIMULATION_MODE = "true";
  [{ id: hospitalId }] = await sql`select id from hospitals where name = 'DEV ONLY Test Hospital A'`;
  await cleanup();
  for (const wa of [D1, D2, D3]) {
    await sql`
      insert into donors (wa_id, name, lang, abo, rh, dob, sex, weight_band, home_geog, radius_km, consent_version, is_synthetic)
      select ${wa}, 'Test', 'en', 'O', 'pos', '1990-01-01', 'male', '55_plus', geog, 10, 'test', true from hospitals where id = ${hospitalId}`;
  }
});
afterAll(cleanup);

describe("donor replies through to fulfilment (PRD 9.5, 7.2)", () => {
  let requestId = "";

  it("donate, pre-screen, ETA: confirmed with directions; deferral keeps only 'deferred'; target closes the request", async () => {
    const r = await createRequest(base(), R);
    if (!r.ok) throw new Error(r.error);
    requestId = await idOf(r.slug);
    // Make sure all three have an alert even at night (quiet hours skip non-critical waves).
    await sql`
      insert into alerts (request_id, donor_id, wave) select ${requestId}, id, 1 from donors where wa_id in (${D1}, ${D2}, ${D3})
      on conflict do nothing`;

    const donate = await respondToAlert(D1, { kind: "donate", requestId });
    expect(donate[0]).toMatchObject({ type: "buttons", key: "prescreen" });
    const eta = await respondToAlert(D1, { kind: "prescreen", clear: true, requestId });
    expect(eta[0]).toMatchObject({ type: "buttons", key: "askEta" });
    const confirmed = await respondToAlert(D1, { kind: "eta", bucket: "lt30", requestId });
    expect(confirmed[0]).toMatchObject({ type: "text", key: "confirmed" });
    const p = (confirmed[0] as { params: Record<string, string> }).params;
    expect(p.directions).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=13\.05,80\.25$/);
    expect(p.family).toBe(R);

    expect(await respondToAlert(D2, { kind: "prescreen", clear: false, requestId })).toEqual([{ type: "text", key: "deferredThanks", params: undefined }]);
    const [a2] = await sql`select a.response from alerts a join donors d on d.id = a.donor_id where a.request_id = ${requestId} and d.wa_id = ${D2}`;
    expect(a2.response).toBe("deferred");

    const [open] = await sql`select status from requests where id = ${requestId}`;
    expect(open.status).toBe("open"); // 1 of 2

    await respondToAlert(D3, { kind: "eta", bucket: "30to60", requestId });
    const [closed] = await sql`select status, next_check_at from requests where id = ${requestId}`;
    expect(closed).toEqual({ status: "fulfilled", next_check_at: null });

    // D1 is told the outcome; D3 (who just confirmed) is not sent a second message.
    const outcomes = await sql`select wa_id from message_log where request_id = ${requestId} and body::text like '%enough donors%'`;
    expect(outcomes.map((o) => o.wa_id)).toEqual([D1]);

    // Nothing more goes out for a closed request.
    expect(await advanceRequest(requestId)).toEqual({ action: "none" });
    expect(await respondToAlert(D2, { kind: "donate", requestId })).toEqual([{ type: "text", key: "alreadyCovered", params: undefined }]);
  });

  it("follow-up 2 h after needed_by goes once to each confirmed donor", async () => {
    await sql`update requests set needed_by = now() - interval '3 hours' where id = ${requestId}`;
    await tick();
    const rows = await sql`select d.wa_id, c.followup_sent_at is not null as sent from confirmations c join donors d on d.id = c.donor_id where c.request_id = ${requestId} order by d.wa_id`;
    expect(rows).toEqual([{ wa_id: D3, sent: true }, { wa_id: D1, sent: true }]);
    expect(await respondToAlert(D1, { kind: "donated", yes: true, requestId })).toEqual([{ type: "text", key: "donatedYesThanks", params: undefined }]);
  });
});

describe("cron tick (PRD 12)", () => {
  it("rejects calls without the secret", async () => {
    process.env.CRON_SECRET = "x".repeat(32);
    expect((await cronGET(new Request("http://x/api/cron/tick"))).status).toBe(401);
    expect((await cronGET(new Request("http://x/api/cron/tick", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  });

  it("expires, fires the next wave, pings the requester, and expires after no reply", async () => {
    const a = await createRequest(base(), R);
    const b = await createRequest(base(), R);
    if (!a.ok || !b.ok) throw new Error("create failed");
    const expiring = await idOf(a.slug);
    const due = await idOf(b.slug);

    await sql`update requests set expires_at = now() - interval '1 minute' where id = ${expiring}`;
    await sql`update requests set trust_level = 'slip_verified', current_wave = 1, next_check_at = now() - interval '1 minute',
              created_at = now() - interval '7 hours' where id = ${due}`;
    await tick();

    const [x] = await sql`select status from requests where id = ${expiring}`;
    expect(x.status).toBe("expired");
    const [y] = await sql`select status, current_wave, last_status_ping_at is not null as pinged, awaiting_still_needed_since is not null as waiting from requests where id = ${due}`;
    expect(y).toEqual({ status: "open", current_wave: 2, pinged: true, waiting: true });
    const pings = await sql`select channel, kind from message_log where request_id = ${due} and wa_id = ${R} and direction = 'out'`;
    expect(pings).toEqual([{ channel: "simulated", kind: "interactive" }]);

    await sql`update requests set awaiting_still_needed_since = now() - interval '3 hours' where id = ${due}`;
    await tick();
    const [z] = await sql`select status from requests where id = ${due}`;
    expect(z.status).toBe("expired");
  });
});
