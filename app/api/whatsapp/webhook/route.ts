// PRD 9.1. GET: Meta subscription check. POST: signed events -> message_log (once per message id)
// and the 24 h window, then onboarding and commands (M4). Alert replies are added in M6.
import { maskPhone } from "@/lib/safety/mask";
import { parseInbound, verifySignature } from "@/lib/wa/webhook";
import { logMessage, recordInbound } from "@/lib/wa/store";
import { handleInbound } from "@/lib/wa/flows/handle";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const token = process.env.WA_VERIFY_TOKEN;
  if (token && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === token) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = new Uint8Array(await req.arrayBuffer());
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), process.env.WA_APP_SECRET ?? "")) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // A database error while recording throws (500), so Meta retries; the message id makes the retry a no-op.
  for (const m of parseInbound(payload)) {
    const isNew = await recordInbound(m);
    console.info(`wa inbound ${m.kind} from ${maskPhone(m.from)}${isNew ? "" : " (duplicate, skipped)"}`);
    if (!isNew) continue;
    // ponytail: a failed handling is logged, not retried (the message is already recorded); the user can resend.
    try {
      await handleInbound(m);
    } catch (e) {
      const error = (e as Error).message;
      console.error(`wa handling failed for ${maskPhone(m.from)}: ${error}`);
      // Hobby logs vanish after ~30 min; keep the reason next to the conversation.
      await logMessage({ direction: "out", waId: m.from, channel: "whatsapp", kind: "send_failed", body: { error } }).catch(() => {});
    }
  }
  return Response.json({ ok: true });
}
