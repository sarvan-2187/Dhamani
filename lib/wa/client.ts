// The ONLY code that talks to the Graph API. Import it from lib/wa/adapter.ts and nowhere else
// (tests/unit/wa-boundary.test.ts enforces this). The adapter enforces WA_ALLOWLIST before calling here.
import { waEnv } from "./config";
import type { DocumentMessage, GraphMessage } from "./types";

if (typeof window !== "undefined") throw new Error("lib/wa/client must not be imported in the browser");

const GRAPH = "https://graph.facebook.com";

export class GraphError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Graph API JSON body for one message (pure, unit-tested). */
export function buildPayload(to: string, m: GraphMessage): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  switch (m.kind) {
    case "text":
      return { ...base, type: "text", text: { body: m.text, preview_url: false } };
    case "document":
      return { ...base, type: "document", document: { id: m.mediaId, filename: m.filename, caption: m.caption } };
    case "template": {
      const t = m.template;
      const components: unknown[] = [];
      if (t.bodyParams.length) {
        components.push({ type: "body", parameters: t.bodyParams.map((text) => ({ type: "text", text })) });
      }
      t.quickReplyPayloads.forEach((payload, index) =>
        components.push({ type: "button", sub_type: "quick_reply", index: String(index), parameters: [{ type: "payload", payload }] }),
      );
      return { ...base, type: "template", template: { name: t.name, language: { code: t.lang }, components } };
    }
    case "interactive": {
      const i = m.interactive;
      const interactive =
        i.type === "button"
          ? { type: "button", body: { text: i.body }, action: { buttons: i.buttons.map((b) => ({ type: "reply", reply: b })) } }
          : { type: "list", body: { text: i.body }, action: { button: i.buttonLabel, sections: [{ title: i.buttonLabel, rows: i.rows }] } };
      return { ...base, type: "interactive", interactive };
    }
  }
}

function auth() {
  const env = waEnv();
  if (!env.phoneNumberId || !env.accessToken) throw new Error("WA_PHONE_NUMBER_ID and WA_ACCESS_TOKEN must be set");
  return env;
}

async function graphFetch(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const env = auth();
  const res = await fetch(`${GRAPH}/${env.graphVersion}/${env.phoneNumberId}/${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${env.accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error ?? {}) as { message?: string; code?: number };
    throw new GraphError(res.status, `Graph API ${res.status}: ${err.message ?? "error"} (code ${err.code ?? "?"})`);
  }
  return json;
}

/** Sends one message; returns the WhatsApp message id. */
export async function graphSend(to: string, m: GraphMessage): Promise<string> {
  const json = await graphFetch("messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildPayload(to, m)),
  });
  const id = (json.messages as { id: string }[] | undefined)?.[0]?.id;
  if (!id) throw new GraphError(502, "Graph API returned no message id");
  return id;
}

/** Uploads a file (e.g. certificate PDF); returns the media id. */
export async function graphUploadMedia(d: DocumentMessage): Promise<string> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", d.mimeType);
  form.append("file", new Blob([new Uint8Array(d.bytes)], { type: d.mimeType }), d.filename);
  const json = await graphFetch("media", { method: "POST", body: form });
  if (typeof json.id !== "string") throw new GraphError(502, "Graph API returned no media id");
  return json.id;
}
