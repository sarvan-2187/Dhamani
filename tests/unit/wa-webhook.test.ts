import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseInbound, verifySignature } from "../../lib/wa/webhook";
import { GET, POST } from "../../app/api/whatsapp/webhook/route";

const SECRET = "unit-test-app-secret";
const body = readFileSync("tests/fixtures/wa/inbound.json");
const sign = (b: Uint8Array, secret = SECRET) => "sha256=" + createHmac("sha256", secret).update(b).digest("hex");

describe("verifySignature (X-Hub-Signature-256)", () => {
  it("accepts the correct HMAC of the raw body", () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
    expect(verifySignature(body, sign(body).toUpperCase().replace("SHA256=", "sha256="), SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const tampered = Buffer.from(body.toString().replace("JOIN", "STOP"));
    expect(verifySignature(tampered, sign(body), SECRET)).toBe(false);
  });

  it("rejects the wrong secret, a missing header, a malformed header and an empty secret", () => {
    expect(verifySignature(body, sign(body, "other"), SECRET)).toBe(false);
    expect(verifySignature(body, null, SECRET)).toBe(false);
    expect(verifySignature(body, "sha256=abc", SECRET)).toBe(false);
    expect(verifySignature(body, sign(body).replace("sha256=", "sha1="), SECRET)).toBe(false);
    expect(verifySignature(body, sign(body, ""), "")).toBe(false);
  });
});

describe("parseInbound", () => {
  const msgs = parseInbound(JSON.parse(body.toString()));

  it("normalises text, button, list, quick reply, location and other; skips statuses and bad senders", () => {
    expect(msgs.map((m) => [m.id, m.kind])).toEqual([
      ["wamid.FIXTURE.text", "text"],
      ["wamid.FIXTURE.button", "reply"],
      ["wamid.FIXTURE.list", "reply"],
      ["wamid.FIXTURE.quickreply", "reply"],
      ["wamid.FIXTURE.location", "location"],
      ["wamid.FIXTURE.image", "other"],
    ]);
  });

  it("extracts the useful parts", () => {
    expect(msgs[0]).toMatchObject({ from: "910000000998", text: "JOIN", at: new Date(1762750000 * 1000) });
    expect(msgs[1].replyId).toBe("DONATE:00000000-0000-0000-0000-000000000001");
    expect(msgs[2].replyId).toBe("GROUP:O+");
    expect(msgs[3].replyId).toBe("NOT_NOW:00000000-0000-0000-0000-000000000001");
    expect(msgs[4].location).toEqual({ lat: 13.0827, lng: 80.2707 });
  });

  it("never keeps the contact profile name", () => {
    expect(JSON.stringify(msgs)).not.toContain("Fixture Person");
  });

  it("tolerates junk", () => {
    expect(parseInbound(null)).toEqual([]);
    expect(parseInbound({ entry: "x" })).toEqual([]);
    expect(parseInbound({ entry: [{ changes: [{ field: "messages", value: { messages: [{}] } }] }] })).toEqual([]);
  });
});

describe("webhook route without a database", () => {
  it("GET returns hub.challenge only for the right verify token", async () => {
    process.env.WA_VERIFY_TOKEN = "unit-verify";
    const url = (token: string) =>
      `http://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=12345`;
    expect(await GET(new Request(url("unit-verify"))).text()).toBe("12345");
    expect(GET(new Request(url("wrong"))).status).toBe(403);
  });

  it("POST with a bad signature is rejected with 401 before anything is stored", async () => {
    process.env.WA_APP_SECRET = SECRET;
    const res = await POST(
      new Request("http://x/api/whatsapp/webhook", { method: "POST", body, headers: { "x-hub-signature-256": sign(body, "wrong") } }),
    );
    expect(res.status).toBe(401);
  });

  it("POST without any secret configured is rejected", async () => {
    delete process.env.WA_APP_SECRET;
    const res = await POST(new Request("http://x", { method: "POST", body, headers: { "x-hub-signature-256": sign(body) } }));
    expect(res.status).toBe(401);
  });
});
