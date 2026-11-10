// Runs against the real database: npm run test:db (after npm run db:reset -- --yes).
// Every case runs in a transaction that is always rolled back.
import { afterAll, describe, expect, it } from "vitest";
import type { PoolClient } from "@neondatabase/serverless";
import { createPool } from "../../db/client";

const pool = createPool();
afterAll(() => pool.end());

async function inTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    return await fn(c);
  } finally {
    await c.query("rollback");
    c.release();
  }
}

const asRole = (role: string, sql: string) =>
  inTx(async (c) => {
    await c.query(`set local role ${role}`);
    return c.query(sql);
  });

const denied = { code: "42501" }; // insufficient_privilege

async function publicTables(): Promise<string[]> {
  const { rows } = await pool.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' and tablename <> 'spatial_ref_sys' order by 1",
  );
  return rows.map((r) => r.tablename);
}

describe("RLS and roles", () => {
  it("has seeded synthetic donors to protect", async () => {
    const { rows } = await pool.query("select count(*)::int as n from donors");
    expect(rows[0].n).toBeGreaterThanOrEqual(50);
  });

  it("enables RLS on every table", async () => {
    const { rows } = await pool.query(
      "select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname <> 'spatial_ref_sys' and not relrowsecurity",
    );
    expect(rows).toEqual([]);
  });

  it("anon cannot list donors", async () => {
    await expect(asRole("dhamani_anon", "select id, wa_id from donors")).rejects.toMatchObject(denied);
  });

  it("anon cannot read any table", async () => {
    for (const t of await publicTables()) {
      await expect(asRole("dhamani_anon", `select 1 from public.${t} limit 1`), t).rejects.toMatchObject(denied);
    }
  });

  it("coordinator sees no donors when nobody has been alerted, even though donors exist", async () => {
    const res = await inTx(async (c) => {
      // Other DB test files write alerts in parallel: hold their writes until this transaction rolls back.
      await c.query("lock table alerts, confirmations in exclusive mode");
      await c.query("delete from alerts");
      await c.query("delete from confirmations");
      await c.query("set local role dhamani_coordinator");
      return c.query("select id from donors");
    });
    expect(res.rows).toEqual([]);
  });

  it("coordinator sees exactly the donors with an alert or confirmation", async () => {
    const { visible, expected } = await inTx(async (c) => {
      // One snapshot for both reads: other DB test files add and remove alerts in parallel.
      await c.query("set transaction isolation level repeatable read");
      const { rows: [h] } = await c.query("select id from hospitals limit 1");
      const { rows: ds } = await c.query("select id from donors where is_synthetic order by wa_id limit 3");
      const { rows: [r] } = await c.query(
        `insert into requests (public_slug, requester_wa_id, hospital_id, patient_label, abo, rh, component, units, needed_by, expires_at)
         values ('rlstest1', '910000000999', $1, 'Test T.', 'O', 'pos', 'whole_blood', 1, now() + interval '3 hours', now() + interval '5 hours')
         returning id`,
        [h.id],
      );
      await c.query("insert into alerts (request_id, donor_id, wave) values ($1, $2, 1)", [r.id, ds[0].id]);
      await c.query("insert into confirmations (request_id, donor_id, eta_bucket) values ($1, $2, 'lt30')", [r.id, ds[1].id]);
      const { rows: exp } = await c.query(
        "select id from donors d where exists (select 1 from alerts a where a.donor_id = d.id) or exists (select 1 from confirmations x where x.donor_id = d.id) order by id",
      );
      await c.query("set local role dhamani_coordinator");
      const { rows: vis } = await c.query("select id from donors order by id");
      return { visible: vis, expected: exp };
    });
    expect(visible).toEqual(expected);
    expect(visible.length).toBeGreaterThanOrEqual(2);
  });

  it("coordinator can read requests and the logs", async () => {
    for (const t of ["requests", "alerts", "confirmations", "message_log", "audit_log", "hospitals"]) {
      await expect(asRole("dhamani_coordinator", `select 1 from ${t} limit 1`), t).resolves.toBeDefined();
    }
  });

  it("coordinator cannot read secrets, sessions or chats", async () => {
    for (const t of ["web_sessions", "console_sessions", "login_codes", "wa_conversations"]) {
      await expect(asRole("dhamani_coordinator", `select 1 from ${t} limit 1`), t).rejects.toMatchObject(denied);
    }
    // 0008: other coordinators' id and name only, never email or password hash.
    await expect(asRole("dhamani_coordinator", "select id, name from coordinators limit 1")).resolves.toBeDefined();
    for (const col of ["email", "password_hash"]) {
      await expect(asRole("dhamani_coordinator", `select ${col} from coordinators limit 1`), col).rejects.toMatchObject(denied);
    }
  });

  it("coordinator can read slips for review (0007, PRD 10.5)", async () => {
    await expect(asRole("dhamani_coordinator", "select request_id from request_slips limit 1")).resolves.toBeDefined();
  });

  it("coordinator cannot write directly", async () => {
    await expect(asRole("dhamani_coordinator", "update requests set status = 'cancelled'")).rejects.toMatchObject(denied);
    await expect(asRole("dhamani_coordinator", "delete from donors")).rejects.toMatchObject(denied);
  });
});
