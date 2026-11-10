// Send one rendered reply to someone other than the current sender (outcomes, pings, follow-ups).
// A failure is recorded in message_log (kind send_failed) and does not stop the caller.
import { maskPhone } from "../safety/mask";
import { adapterFor } from "./adapter";
import { render, type Reply } from "./flows/reply";
import { logMessage } from "./store";
import type { Lang, TemplateMessage } from "./types";

export async function sendReply(
  to: { waId: string; isSynthetic: boolean; lang: Lang },
  reply: Reply,
  opts: { requestId?: string; fallback?: TemplateMessage } = {},
): Promise<boolean> {
  try {
    const adapter = adapterFor({ waId: to.waId, isSynthetic: to.isSynthetic });
    const r = render(reply, to.lang);
    if (r.kind === "text") await adapter.sendText(to.waId, r.text, opts);
    else await adapter.sendInteractive(to.waId, r.interactive, opts);
    return true;
  } catch (e) {
    const error = (e as Error).message;
    console.error(`send failed for ${maskPhone(to.waId)}: ${error}`);
    await logMessage({ direction: "out", waId: to.waId, channel: "whatsapp", kind: "send_failed", body: { error }, requestId: opts.requestId }).catch(() => {});
    return false;
  }
}
