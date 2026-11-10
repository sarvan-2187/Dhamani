// PRD 9.1: signature check and parsing for Meta webhook POSTs.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Inbound } from "./types";

/** X-Hub-Signature-256 = "sha256=" + hex HMAC-SHA256 of the raw body with WA_APP_SECRET. */
export function verifySignature(rawBody: Uint8Array, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!m) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(m[1], "hex"));
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

function toInbound(raw: unknown): Inbound | null {
  const m = obj(raw);
  const id = str(m.id);
  const from = str(m.from);
  const ts = Number(m.timestamp);
  const type = str(m.type) ?? "unknown";
  if (!id || !from || !/^\d{8,15}$/.test(from) || !Number.isFinite(ts)) return null;
  const base = { id, from, at: new Date(ts * 1000), rawType: type };

  if (type === "text") return { ...base, kind: "text", text: str(obj(m.text).body) ?? "" };
  if (type === "interactive") {
    const i = obj(m.interactive);
    const reply = obj(i.button_reply ?? i.list_reply);
    const replyId = str(reply.id);
    if (replyId) return { ...base, kind: "reply", replyId, text: str(reply.title) };
  }
  if (type === "button") {
    const b = obj(m.button);
    const replyId = str(b.payload);
    if (replyId) return { ...base, kind: "reply", replyId, text: str(b.text) };
  }
  if (type === "location") {
    const l = obj(m.location);
    const lat = Number(l.latitude);
    const lng = Number(l.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { ...base, kind: "location", location: { lat, lng } };
  }
  return { ...base, kind: "other" };
}

/** All inbound messages in a webhook payload. Status updates and malformed entries are skipped. */
export function parseInbound(payload: unknown): Inbound[] {
  const out: Inbound[] = [];
  for (const entry of arr(obj(payload).entry)) {
    for (const change of arr(obj(entry).changes)) {
      const c = obj(change);
      if (c.field !== "messages") continue;
      for (const m of arr(obj(c.value).messages)) {
        const parsed = toInbound(m);
        if (parsed) out.push(parsed);
      }
    }
  }
  return out;
}
