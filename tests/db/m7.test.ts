// M7 "done when": all console actions work and are logged. Against the real database; synthetic numbers and a
// throwaway @dhamani.test account only; everything is cleaned up. (resetDemoData is not run here: it deletes every
// DEV ONLY request, which would race with the other DB test files.)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neon } from "@neondatabase/serverless";
import { verifyPassword } from "../../lib/auth/password";
import { addAccount, changeAccount } from "../../lib/console/accounts";
import { runRequestAction } from "../../lib/console/actions";
import { login, type Coordinator } from "../../lib/console/auth";
import { loadMessages, loadQueues, loadRequestDetail } from "../../lib/console/read";
import { simulateReplies } from "../../lib/console/simulation";

const sql = neon(process.env.DATABASE_URL!);
const R = "910000000978";
const DONORS = ["910000000977", "910000000976", "910000000975"];
const EMAIL = "m7-admin@dhamani.test";
const OTHER = "m7-coord@dhamani.test";
let hospitalId = "";
let admin: Coordinator;

async function cleanup() {
  const ids = (await sql`select id from requests where requester_wa_id = ${R}`).map((r) => r.id);
  await sql`delete from message_log where request_id = any(${ids}::uuid[]) or wa_id = any(${[R, ...DONORS]}::text[])`;
  await sql`delete from audit_log where request_id = any(${ids}::uuid[]) or actor in (${EMAIL}, ${OTHER})
            or actor in (select id::text from coordinators where email in (${EMAIL}, ${OTHER}))`;
  await sql`delete from requests where requester_wa_id = ${R}`;
  await sql`delete from donors where wa_id = any(${DONORS}::text[])`;
  await sql`delete from wa_conversations where wa_id = any(${DONORS}::text[])`;
  await sql`delete from coordinators where email in (${EMAIL}, ${OTHER})`;
}

/** An O+ request with no automatic waves (next_check_at null), so the test controls every alert. */
async function newRequest(status = "open"): Promise<string> {
  const slug = `m7${Math.random().toString(36).slice(2, 8)}`;
  const [r] = await sql`
    insert into requests (public_slug, requester_wa_id, hospital_id, patient_label, abo, rh, component, units, needed_by,
                          expires_at, status, current_wave)
    values (${slug}, ${R}, ${hospitalId}, 'Ravi K.', 'O', 'pos', 'whole_blood', 1, now() + interval '3 hours',
            now() + interval '5 hours', ${status}, 1)
    returning id`;
  return r.id;
}
const state = async (id: string) => (await sql`select status, trust_level from requests where id = ${id}`)[0];
const audited = async (id: string) => (await sql`select action from audit_log where request_id = ${id} order by at, id`).map((a) => a.action);

beforeAll(async () => {
  process.env.SIMULATION_MODE = "true";
  [{ id: hospitalId }] = await sql`select id from hospitals where name = 'DEV ONLY Test Hospital A'`;
  await cleanup();
  for (const wa of DONORS) {
    await sql`
      insert into donors (wa_id, name, lang, abo, rh, dob, sex, weight_band, home_geog, radius_km, consent_version, is_synthetic)
      select ${wa}, 'Sim Donor', 'en', 'O', 'pos', '1990-01-01', 'male', '55_plus', geog, 10, 'test', true from hospitals where id = ${hospitalId}`;
  }
  const [c] = await sql`
    insert into coordinators (email, name, password_hash, role) values (${EMAIL}, 'M7 Admin', 'unused', 'super_admin') returning id`;
  admin = { id: c.id, email: EMAIL, name: "M7 Admin", role: "super_admin" };
});
afterAll(cleanup);

describe("request actions (PRD 10.5, 7.3)", () => {
  it("release a hold opens the request and is logged", async () => {
    const id = await newRequest("held");
    expect(await runRequestAction(admin.id, id, "release")).toBe(true);
    expect((await state(id)).status).toBe("open");
    expect(await audited(id)).toContain("console_release");
  });

  it("freeze, unfreeze, verify and cancel follow the lifecycle and refuse the wrong state", async () => {
    const id = await newRequest();
    expect(await runRequestAction(admin.id, id, "unfreeze")).toBe(false); // not frozen
    expect(await runRequestAction(admin.id, id, "freeze")).toBe(true);
    expect((await state(id)).status).toBe("frozen");
    expect(await runRequestAction(admin.id, id, "unfreeze")).toBe(true);
    expect(await runRequestAction(admin.id, id, "verify")).toBe(true);
    expect((await state(id)).trust_level).toBe("coordinator_verified");
    expect(await runRequestAction(admin.id, id, "approve_slip")).toBe(false); // no slip
    expect(await runRequestAction(admin.id, id, "cancel")).toBe(true);
    expect((await state(id)).status).toBe("cancelled");
    expect(await runRequestAction(admin.id, id, "freeze")).toBe(false); // closed
    expect(await audited(id)).toEqual(["console_freeze", "console_unfreeze", "console_verify", "closed_cancelled"]);
  });

  it("approve slip needs a slip", async () => {
    const id = await newRequest();
    await sql`insert into request_slips (request_id, content, content_type) values (${id}, '\\x00'::bytea, 'image/png')`;
    expect(await runRequestAction(admin.id, id, "approve_slip")).toBe(true);
    expect((await state(id)).trust_level).toBe("slip_verified");
  });
});

describe("console reads run as dhamani_coordinator and never show phone numbers", () => {
  it("queues, detail and message log load; numbers are masked", async () => {
    const id = await newRequest();
    await sql`insert into message_log (direction, wa_id, channel, kind, body, request_id)
              values ('out', ${R}, 'simulated', 'text', ${JSON.stringify({ text: `call ${R}` })}::jsonb, ${id})`;
    const q = await loadQueues("open");
    expect(q.rows.some((r) => r.id === id)).toBe(true);
    const d = await loadRequestDetail(id);
    expect(d?.patientLabel).toBe("Ravi K.");
    const msgs = await loadMessages(d!.code);
    expect(msgs.length).toBeGreaterThan(0);
    expect(JSON.stringify(msgs)).not.toContain(R);
    expect(msgs[0].text).toContain("••••0978");
  });
});

describe("simulate replies (PRD 10.5, 17 step 5)", () => {
  it("synthetic donors reply through the webhook handler until the target is reached", async () => {
    const id = await newRequest();
    await sql`insert into alerts (request_id, donor_id, wave) select ${id}, id, 1 from donors where wa_id = any(${DONORS}::text[])`;
    const res = await simulateReplies(admin.id, id, { donatePct: 100, notNowPct: 0 });
    expect(res.pending).toBe(3);
    expect((await state(id)).status).toBe("fulfilled"); // target for 1 unit is 2
    const [{ n }] = await sql`select count(*)::int as n from confirmations where request_id = ${id}`;
    expect(n).toBe(2);
    const [{ inbound }] = await sql`
      select count(*)::int as inbound from message_log where request_id = ${id} and direction = 'in' and channel = 'simulated'`;
    expect(inbound).toBe(6); // DONATE, PRE:clear, ETA for each of the two who confirmed
    expect((await audited(id)).some((a) => a.startsWith("sim_replies_"))).toBe(true);
  });
});

describe("console login and accounts (PRD 8.3, super admin)", () => {
  it("adds an account with a one-time password that signs in; wrong passwords lock after 5", async () => {
    const r = await addAccount(admin, { email: OTHER, name: "M7 Coordinator", role: "coordinator" });
    if (!r.ok) throw new Error(r.error);
    const [row] = await sql`select password_hash from coordinators where email = ${OTHER}`;
    expect(await verifyPassword(r.password!, row.password_hash)).toBe(true);
    expect(await addAccount(admin, { email: OTHER, name: "Again", role: "coordinator" })).toEqual({ ok: false, error: "exists" });

    expect((await login(OTHER, r.password!)).ok).toBe(true);
    for (let i = 0; i < 5; i++) expect(await login(OTHER, "wrong")).toEqual({ ok: false, error: "invalid" });
    expect(await login(OTHER, r.password!)).toEqual({ ok: false, error: "locked" });
  });

  it("disabling ends sessions and blocks sign-in; a super admin cannot disable themselves", async () => {
    const [row] = await sql`select id from coordinators where email = ${OTHER}`;
    await sql`delete from audit_log where actor = ${OTHER}`; // clear the lockout from the previous test
    expect(await changeAccount(admin, admin.id, "disable")).toEqual({ ok: false, error: "self" });
    expect((await changeAccount(admin, row.id, "disable")).ok).toBe(true);
    const [{ n }] = await sql`select count(*)::int as n from console_sessions where coordinator_id = ${row.id}`;
    expect(n).toBe(0);
    const reset = await changeAccount(admin, row.id, "reset_password");
    if (!reset.ok) throw new Error(reset.error);
    expect(await login(OTHER, reset.password!)).toEqual({ ok: false, error: "invalid" }); // disabled
  });
});
