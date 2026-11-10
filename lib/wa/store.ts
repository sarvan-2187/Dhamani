// message_log and the 24 h customer service window (wa_conversations.window_open_until).
import { db } from "../db";
import type { Inbound, LogEntry } from "./types";

const WINDOW_MS = 24 * 3_600_000;

export async function logMessage(e: LogEntry): Promise<void> {
  await db()`
    insert into message_log (direction, wa_id, channel, kind, body, request_id, wa_message_id)
    values (${e.direction}, ${e.waId}, ${e.channel}, ${e.kind}, ${JSON.stringify(e.body)}::jsonb,
            ${e.requestId ?? null}, ${e.waMessageId ?? null})`;
}

export async function isWindowOpen(waId: string): Promise<boolean> {
  const rows = await db()`select window_open_until > now() as open from wa_conversations where wa_id = ${waId}`;
  return rows[0]?.open === true;
}

/**
 * Logs one inbound message and opens the 24 h window from its timestamp, in one statement.
 * Returns false if this WhatsApp message id was already processed (Meta retries).
 */
export async function recordInbound(m: Inbound): Promise<boolean> {
  const body = { kind: m.kind, rawType: m.rawType, text: m.text, replyId: m.replyId, location: m.location };
  const until = new Date(m.at.getTime() + WINDOW_MS);
  const rows = await db()`
    with ins as (
      insert into message_log (direction, wa_id, channel, kind, body, wa_message_id)
      values ('in', ${m.from}, 'whatsapp', ${m.kind}, ${JSON.stringify(body)}::jsonb, ${m.id})
      on conflict (wa_message_id) do nothing
      returning id
    ), win as (
      insert into wa_conversations (wa_id, window_open_until, updated_at)
      select ${m.from}, ${until.toISOString()}::timestamptz, now() where exists (select 1 from ins)
      on conflict (wa_id) do update
        set window_open_until = greatest(wa_conversations.window_open_until, excluded.window_open_until),
            updated_at = now()
    )
    select count(*)::int as inserted from ins`;
  return rows[0].inserted === 1;
}
