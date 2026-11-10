// PRD 9.2. Every outbound WhatsApp message goes through adapterFor(). RealAdapter refuses any number
// outside WA_ALLOWLIST before touching the network; SimulatedAdapter only writes message_log.
import { maskPhone } from "../safety/mask";
import { graphSend, graphUploadMedia } from "./client";
import { waEnv } from "./config";
import { isWindowOpen, logMessage } from "./store";
import type { GraphMessage, LogEntry, SendResult, TemplateMessage, WhatsAppAdapter } from "./types";

export class AllowlistError extends Error {}
export class WindowClosedError extends Error {}

export type RealDeps = {
  allowlist: ReadonlySet<string>;
  send: (to: string, m: GraphMessage) => Promise<string>;
  upload: typeof graphUploadMedia;
  isWindowOpen: (waId: string) => Promise<boolean>;
  log: (e: LogEntry) => Promise<void>;
};

const kindOf = (m: GraphMessage) => (m.kind === "template" ? m.template.name : m.kind);
const logBody = (m: GraphMessage) => (m.kind === "document" ? { filename: m.filename, caption: m.caption } : m);

export function createRealAdapter(deps: RealDeps): WhatsAppAdapter {
  function guard(to: string) {
    if (!deps.allowlist.has(to)) throw new AllowlistError(`Refusing to send to ${maskPhone(to)}: not in WA_ALLOWLIST`);
  }

  async function deliver(to: string, m: GraphMessage, requestId: string | null | undefined, via: SendResult["via"]) {
    guard(to); // checked again right before every network call
    const messageId = await deps.send(to, m);
    await deps.log({ direction: "out", waId: to, channel: "whatsapp", kind: kindOf(m), body: logBody(m), requestId, waMessageId: messageId });
    return { channel: "whatsapp" as const, via, messageId };
  }

  async function freeFormOrFallback(to: string, m: GraphMessage, opts?: { requestId?: string | null; fallback?: TemplateMessage }) {
    guard(to);
    if (await deps.isWindowOpen(to)) return deliver(to, m, opts?.requestId, "free_form");
    if (opts?.fallback) return deliver(to, { kind: "template", template: opts.fallback }, opts.requestId, "template");
    throw new WindowClosedError(`24 h window closed for ${maskPhone(to)} and no template fallback given`);
  }

  return {
    sendTemplate: (to, template, ctx) => deliver(to, { kind: "template", template }, ctx?.requestId, "template"),
    sendInteractive: (to, interactive, opts) => freeFormOrFallback(to, { kind: "interactive", interactive }, opts),
    sendText: (to, text, opts) => freeFormOrFallback(to, { kind: "text", text }, opts),
    async sendDocument(to, d, ctx) {
      guard(to);
      if (!(await deps.isWindowOpen(to))) throw new WindowClosedError(`24 h window closed for ${maskPhone(to)}`);
      const mediaId = await deps.upload(d);
      return deliver(to, { kind: "document", mediaId, filename: d.filename, caption: d.caption }, ctx?.requestId, "free_form");
    },
  };
}

export function createSimulatedAdapter(deps: { log: (e: LogEntry) => Promise<void> }): WhatsAppAdapter {
  async function record(to: string, m: GraphMessage, requestId?: string | null): Promise<SendResult> {
    await deps.log({ direction: "out", waId: to, channel: "simulated", kind: kindOf(m), body: logBody(m), requestId });
    return { channel: "simulated", via: m.kind === "template" ? "template" : "free_form", messageId: null };
  }
  return {
    sendTemplate: (to, template, ctx) => record(to, { kind: "template", template }, ctx?.requestId),
    sendInteractive: (to, interactive, opts) => record(to, { kind: "interactive", interactive }, opts?.requestId),
    sendText: (to, text, opts) => record(to, { kind: "text", text }, opts?.requestId),
    sendDocument: (to, d, ctx) => record(to, { kind: "document", mediaId: "simulated", filename: d.filename, caption: d.caption }, ctx?.requestId),
  };
}

export type Recipient = { waId: string; isSynthetic: boolean };

/**
 * The single selection point (PRD 9.2):
 * synthetic donors -> simulated; allowlisted -> real; SIMULATION_MODE -> simulated; otherwise real, which throws.
 */
export function pickChannel(r: Recipient, env: { allowlist: ReadonlySet<string>; simulationMode: boolean }): "real" | "simulated" {
  if (r.isSynthetic) return "simulated";
  if (env.allowlist.has(r.waId)) return "real";
  return env.simulationMode ? "simulated" : "real";
}

export function adapterFor(r: Recipient): WhatsAppAdapter {
  const env = waEnv();
  return pickChannel(r, env) === "simulated"
    ? createSimulatedAdapter({ log: logMessage })
    : createRealAdapter({ allowlist: env.allowlist, send: graphSend, upload: graphUploadMedia, isWindowOpen, log: logMessage });
}
