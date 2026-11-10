// M3 "done when": the webhook accepts a signed fixture, logs each message once, and opens the 24 h window.
// Runs the real route handler against the real database. Cleans up only fixture rows.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neon } from "@neondatabase/serverless";
import { POST } from "../../app/api/whatsapp/webhook/route";

const SECRET = "db-test-app-secret";
const WA_ID = "910000000998"; // synthetic: can never be a real Indian mobile
const sql = neon(process.env.DATABASE_URL!);
const body = readFileSync("tests/fixtures/wa/inbound.json");
const sign = (b: Uint8Array, secret = SECRET) => "sha256=" + createHmac("sha256", secret).update(b).digest("hex");

const post = (b: Uint8Array, signature: string) =>
  POST(new Request("http://localhost/api/whatsapp/webhook", { method: "POST", body: new Uint8Array(b), headers: { "x-hub-signature-256": signature } }));

async function cleanup() {
  await sql`delete from message_log where wa_message_id like 'wamid.FIXTURE.%'`;
  await sql`delete from wa_conversations where wa_id = ${WA_ID}`;
  await sql`delete from message_log where wa_id = ${WA_ID}`; // simulated replies from M4 handling
}

const fixtureRows = () =>
  sql`select wa_message_id, direction, channel, kind, body from message_log where wa_message_id like 'wamid.FIXTURE.%' order by wa_message_id`;

beforeAll(async () => {
  process.env.WA_APP_SECRET = SECRET;
  process.env.SIMULATION_MODE = "true";
  await cleanup();
});
afterAll(cleanup);

describe("POST /api/whatsapp/webhook with a signed fixture", () => {
  it("rejects a bad signature and stores nothing", async () => {
    expect((await post(body, sign(body, "wrong"))).status).toBe(401);
    expect(await fixtureRows()).toEqual([]);
  });

  it("accepts the signed payload and logs each valid message once", async () => {
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    const rows = await fixtureRows();
    expect(rows.map((r) => [r.wa_message_id, r.direction, r.channel, r.kind])).toEqual([
      ["wamid.FIXTURE.button", "in", "whatsapp", "reply"],
      ["wamid.FIXTURE.image", "in", "whatsapp", "other"],
      ["wamid.FIXTURE.list", "in", "whatsapp", "reply"],
      ["wamid.FIXTURE.location", "in", "whatsapp", "location"],
      ["wamid.FIXTURE.quickreply", "in", "whatsapp", "reply"],
      ["wamid.FIXTURE.text", "in", "whatsapp", "text"],
    ]);
    expect(rows.find((r) => r.wa_message_id === "wamid.FIXTURE.text")!.body).toMatchObject({ text: "JOIN" });
    expect(JSON.stringify(rows)).not.toContain("Fixture Person");
  });

  it("opens the 24 h window from the latest message timestamp", async () => {
    const [w] = await sql`select window_open_until from wa_conversations where wa_id = ${WA_ID}`;
    expect(new Date(w.window_open_until).getTime()).toBe((1762750005 + 24 * 3600) * 1000);
  });

  it("is idempotent: a Meta retry of the same payload adds nothing", async () => {
    expect((await post(body, sign(body))).status).toBe(200);
    expect(await fixtureRows()).toHaveLength(6);
  });
});
