// M4 "done when", against the real database: a full onboarding through signed webhook posts stores the donor
// with the location rounded, then PAUSE and STOP update the row. Replies go through the SimulatedAdapter.
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neon } from "@neondatabase/serverless";
import { POST } from "../../app/api/whatsapp/webhook/route";

const SECRET = "db-test-app-secret";
const WA_ID = "910000000997"; // synthetic: never a real Indian mobile, never on the allowlist
const sql = neon(process.env.DATABASE_URL!);
let n = 0;

function payload(message: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "0", changes: [{ field: "messages", value: { messaging_product: "whatsapp", messages: [
      { from: WA_ID, id: `wamid.ONBTEST.${Date.now()}.${n++}`, timestamp: String(Math.floor(Date.now() / 1000)), ...message },
    ] } }] }],
  };
}

async function post(message: Record<string, unknown>) {
  const body = new TextEncoder().encode(JSON.stringify(payload(message)));
  const sig = "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
  const res = await POST(new Request("http://localhost/api/whatsapp/webhook", { method: "POST", body, headers: { "x-hub-signature-256": sig } }));
  expect(res.status).toBe(200);
}
const text = (body: string) => post({ type: "text", text: { body } });
const tap = (id: string) => post({ type: "interactive", interactive: { type: "button_reply", button_reply: { id, title: id } } });
const pick = (id: string) => post({ type: "interactive", interactive: { type: "list_reply", list_reply: { id, title: id } } });

async function cleanup() {
  await sql`delete from donors where wa_id = ${WA_ID}`;
  await sql`delete from wa_conversations where wa_id = ${WA_ID}`;
  await sql`delete from message_log where wa_id = ${WA_ID}`;
}

beforeAll(async () => {
  process.env.WA_APP_SECRET = SECRET;
  process.env.SIMULATION_MODE = "true";
  await cleanup();
});
afterAll(cleanup);

describe("donor onboarding over the webhook", () => {
  it("JOIN through Done stores the donor with the location rounded to about 500 m", async () => {
    await text("JOIN");
    await tap("ONB:LANG:en");
    await tap("ONB:AGREE");
    await text("Asha");
    await pick("ONB:GROUP:A-");
    await text("05-08-1995");
    await tap("ONB:SEX:female");
    await tap("ONB:WEIGHT:55_plus");
    await post({ type: "location", location: { latitude: 13.0827, longitude: 80.2707 } });
    await tap("ONB:LAST:never");
    await tap("ONB:RADIUS:10");
    await tap("ONB:NIGHT:no");
    await tap("ONB:RARE:yes"); // A- is Rh-negative

    const [d] = await sql`
      select name, lang, abo, rh, is_bombay, to_char(dob, 'YYYY-MM-DD') as dob, sex, weight_band, radius_km,
             last_donated_on, night_ok, rare_registry_opt_in, consent_version, is_synthetic, stopped_at,
             st_y(home_geog::geometry) as lat, st_x(home_geog::geometry) as lng
      from donors where wa_id = ${WA_ID}`;
    expect(d).toMatchObject({
      name: "Asha", lang: "en", abo: "A", rh: "neg", is_bombay: false, dob: "1995-08-05", sex: "female",
      weight_band: "55_plus", radius_km: 10, last_donated_on: null, night_ok: false, rare_registry_opt_in: true,
      consent_version: "2026-11-v1", is_synthetic: false, stopped_at: null,
    });
    expect(d.lat).toBeCloseTo(13.085, 9);
    expect(d.lng).toBeCloseTo(80.27, 9);

    const [c] = await sql`select flow, step from wa_conversations where wa_id = ${WA_ID}`;
    expect(c).toEqual({ flow: null, step: null });

    const out = await sql`select channel, kind from message_log where wa_id = ${WA_ID} and direction = 'out' order by id`;
    expect(out.length).toBe(13); // one reply per step, all simulated (not on the allowlist)
    expect(out.every((r) => r.channel === "simulated")).toBe(true);
  });

  it("PAUSE 30 sets paused_until about 30 days ahead", async () => {
    await text("PAUSE 30");
    const [d] = await sql`select extract(epoch from paused_until - now()) / 86400 as days from donors where wa_id = ${WA_ID}`;
    expect(Number(d.days)).toBeGreaterThan(29.9);
    expect(Number(d.days)).toBeLessThan(30.1);
  });

  it("STOP sets stopped_at", async () => {
    await text("STOP");
    const [d] = await sql`select stopped_at from donors where wa_id = ${WA_ID}`;
    expect(d.stopped_at).not.toBeNull();
  });
});
