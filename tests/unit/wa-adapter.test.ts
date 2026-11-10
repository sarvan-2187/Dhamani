import { describe, expect, it, vi } from "vitest";
import {
  AllowlistError,
  WindowClosedError,
  createRealAdapter,
  createSimulatedAdapter,
  pickChannel,
  type RealDeps,
} from "../../lib/wa/adapter";
import { buildPayload } from "../../lib/wa/client";
import { parseAllowlist } from "../../lib/wa/config";
import { maskPhone } from "../../lib/safety/mask";
import type { LogEntry, TemplateMessage } from "../../lib/wa/types";

const ALLOWED = "919000000001";
const STRANGER = "919888877777";

const template: TemplateMessage = { name: "request_alert", lang: "en", bodyParams: ["O+"], quickReplyPayloads: ["DONATE:r1"] };
const buttons = { type: "button" as const, body: "Can you donate?", buttons: [{ id: "DONATE:r1", title: "Donate" }] };
const doc = { bytes: new Uint8Array([37, 80, 68, 70]), filename: "certificate.pdf", mimeType: "application/pdf" };

function realDeps(windowOpen: boolean) {
  const logs: LogEntry[] = [];
  const deps: RealDeps = {
    allowlist: new Set([ALLOWED]),
    send: vi.fn(async () => "wamid.OUT"),
    upload: vi.fn(async () => "media-1"),
    isWindowOpen: vi.fn(async () => windowOpen),
    log: vi.fn(async (e: LogEntry) => void logs.push(e)),
  };
  return { deps, logs };
}

describe("WA_ALLOWLIST parsing", () => {
  it("accepts up to 5 numbers, strips + and spaces", () => {
    expect([...parseAllowlist(" +919000000001, 919000000002 ")]).toEqual(["919000000001", "919000000002"]);
  });
  it("is empty (nobody allowed) when unset", () => {
    expect(parseAllowlist(undefined).size).toBe(0);
    expect(parseAllowlist("").size).toBe(0);
  });
  it("throws on more than 5 numbers or a malformed entry", () => {
    expect(() => parseAllowlist("911111111111,912222222222,913333333333,914444444444,915555555555,916666666666")).toThrow(/at most 5/);
    expect(() => parseAllowlist("91-98765-43210")).toThrow(/digits/);
  });
});

describe("RealAdapter never sends outside the allowlist", () => {
  it.each([
    ["sendTemplate", (a: ReturnType<typeof createRealAdapter>) => a.sendTemplate(STRANGER, template)],
    ["sendInteractive", (a: ReturnType<typeof createRealAdapter>) => a.sendInteractive(STRANGER, buttons, { fallback: template })],
    ["sendText", (a: ReturnType<typeof createRealAdapter>) => a.sendText(STRANGER, "hi", { fallback: template })],
    ["sendDocument", (a: ReturnType<typeof createRealAdapter>) => a.sendDocument(STRANGER, doc)],
  ])("%s to a non-allowlisted number throws and makes no network call", async (_, call) => {
    const { deps } = realDeps(true);
    await expect(call(createRealAdapter(deps))).rejects.toBeInstanceOf(AllowlistError);
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.log).not.toHaveBeenCalled();
  });

  it("the error message masks the number", async () => {
    const { deps } = realDeps(true);
    await expect(createRealAdapter(deps).sendText(STRANGER, "hi")).rejects.toThrow("********7777");
  });

  it("an empty allowlist blocks everyone", async () => {
    const { deps } = realDeps(true);
    await expect(createRealAdapter({ ...deps, allowlist: new Set() }).sendTemplate(ALLOWED, template)).rejects.toBeInstanceOf(AllowlistError);
  });
});

describe("RealAdapter and the 24 h window", () => {
  it("window open: free-form interactive, logged with the message id", async () => {
    const { deps, logs } = realDeps(true);
    const res = await createRealAdapter(deps).sendInteractive(ALLOWED, buttons, { fallback: template, requestId: "r1" });
    expect(res).toEqual({ channel: "whatsapp", via: "free_form", messageId: "wamid.OUT" });
    expect(deps.send).toHaveBeenCalledWith(ALLOWED, { kind: "interactive", interactive: buttons });
    expect(logs).toEqual([
      { direction: "out", waId: ALLOWED, channel: "whatsapp", kind: "interactive", body: { kind: "interactive", interactive: buttons }, requestId: "r1", waMessageId: "wamid.OUT" },
    ]);
  });

  it("window closed: sends the approved template instead", async () => {
    const { deps, logs } = realDeps(false);
    const res = await createRealAdapter(deps).sendInteractive(ALLOWED, buttons, { fallback: template });
    expect(res.via).toBe("template");
    expect(deps.send).toHaveBeenCalledWith(ALLOWED, { kind: "template", template });
    expect(logs[0].kind).toBe("request_alert");
  });

  it("window closed and no fallback: throws, sends nothing", async () => {
    const { deps } = realDeps(false);
    await expect(createRealAdapter(deps).sendText(ALLOWED, "hi")).rejects.toBeInstanceOf(WindowClosedError);
    await expect(createRealAdapter(deps).sendDocument(ALLOWED, doc)).rejects.toBeInstanceOf(WindowClosedError);
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("documents: upload then send; the log never contains the file bytes", async () => {
    const { deps, logs } = realDeps(true);
    await createRealAdapter(deps).sendDocument(ALLOWED, { ...doc, caption: "Thank you" });
    expect(deps.upload).toHaveBeenCalledOnce();
    expect(deps.send).toHaveBeenCalledWith(ALLOWED, { kind: "document", mediaId: "media-1", filename: "certificate.pdf", caption: "Thank you" });
    expect(logs[0].body).toEqual({ filename: "certificate.pdf", caption: "Thank you" });
  });
});

describe("SimulatedAdapter", () => {
  it("only writes message_log with channel simulated", async () => {
    const logs: LogEntry[] = [];
    const sim = createSimulatedAdapter({ log: async (e) => void logs.push(e) });
    await sim.sendTemplate(STRANGER, template, { requestId: "r1" });
    await sim.sendInteractive(STRANGER, buttons);
    await sim.sendText(STRANGER, "hi");
    await sim.sendDocument(STRANGER, doc);
    expect(logs.map((l) => [l.channel, l.kind])).toEqual([
      ["simulated", "request_alert"],
      ["simulated", "interactive"],
      ["simulated", "text"],
      ["simulated", "document"],
    ]);
    expect(logs[0].requestId).toBe("r1");
  });
});

describe("pickChannel: the single selection point", () => {
  const env = (simulationMode: boolean) => ({ allowlist: new Set([ALLOWED]), simulationMode });
  it.each([
    [{ waId: "910000000001", isSynthetic: true }, true, "simulated"],
    [{ waId: "910000000001", isSynthetic: true }, false, "simulated"],
    [{ waId: ALLOWED, isSynthetic: false }, true, "real"],
    [{ waId: ALLOWED, isSynthetic: false }, false, "real"],
    [{ waId: STRANGER, isSynthetic: false }, true, "simulated"],
    [{ waId: STRANGER, isSynthetic: false }, false, "real"], // and RealAdapter then throws
  ])("%o simulation=%s -> %s", (r, sim, expected) => {
    expect(pickChannel(r, env(sim))).toBe(expected);
  });
});

describe("buildPayload", () => {
  it("template: body params and one quick reply payload per button, in order", () => {
    const p = buildPayload(ALLOWED, {
      kind: "template",
      template: { name: "request_status", lang: "ta", bodyParams: ["DH-7Q4K", "2"], quickReplyPayloads: ["STILL_NEEDED:1", "FULFILLED:1", "CANCEL:1"] },
    });
    expect(p).toMatchObject({ to: ALLOWED, type: "template", template: { name: "request_status", language: { code: "ta" } } });
    const components = (p.template as { components: { type: string; index?: string; parameters: unknown[] }[] }).components;
    expect(components[0]).toEqual({ type: "body", parameters: [{ type: "text", text: "DH-7Q4K" }, { type: "text", text: "2" }] });
    expect(components.slice(1).map((c) => [c.index, c.parameters])).toEqual([
      ["0", [{ type: "payload", payload: "STILL_NEEDED:1" }]],
      ["1", [{ type: "payload", payload: "FULFILLED:1" }]],
      ["2", [{ type: "payload", payload: "CANCEL:1" }]],
    ]);
  });

  it("interactive buttons and list", () => {
    expect(buildPayload(ALLOWED, { kind: "interactive", interactive: buttons })).toMatchObject({
      type: "interactive",
      interactive: { type: "button", body: { text: "Can you donate?" }, action: { buttons: [{ type: "reply", reply: { id: "DONATE:r1", title: "Donate" } }] } },
    });
    const list = buildPayload(ALLOWED, {
      kind: "interactive",
      interactive: { type: "list", body: "Your blood group?", buttonLabel: "Choose", rows: [{ id: "GROUP:O+", title: "O+" }] },
    });
    expect(list).toMatchObject({ interactive: { type: "list", action: { button: "Choose", sections: [{ rows: [{ id: "GROUP:O+", title: "O+" }] }] } } });
  });

  it("text never previews links", () => {
    expect(buildPayload(ALLOWED, { kind: "text", text: "hi" })).toMatchObject({ type: "text", text: { body: "hi", preview_url: false } });
  });
});

describe("maskPhone", () => {
  it("keeps only the last 4 digits", () => {
    expect(maskPhone("919876543210")).toBe("********3210");
    expect(maskPhone("123")).toBe("****");
  });
});
