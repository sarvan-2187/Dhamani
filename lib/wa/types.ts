// Shared WhatsApp message shapes. Kept apart from client.ts so only adapter.ts ever imports the client.

export type Lang = "en" | "ta" | "te";

export type ReplyButton = { id: string; title: string }; // Meta: up to 3 buttons, title up to 20 chars

export type Interactive =
  | { type: "button"; body: string; buttons: ReplyButton[] }
  | { type: "list"; body: string; buttonLabel: string; rows: { id: string; title: string; description?: string }[] };

export type TemplateMessage = {
  name: string;
  lang: Lang;
  bodyParams: string[];
  quickReplyPayloads: string[]; // one per quick reply button, in order
};

export type DocumentMessage = { bytes: Uint8Array; filename: string; mimeType: string; caption?: string };

/** What actually goes to the Graph API. */
export type GraphMessage =
  | { kind: "text"; text: string }
  | { kind: "interactive"; interactive: Interactive }
  | { kind: "template"; template: TemplateMessage }
  | { kind: "document"; mediaId: string; filename: string; caption?: string };

export type SendContext = { requestId?: string | null };
export type SendResult = { channel: "whatsapp" | "simulated"; via: "free_form" | "template"; messageId: string | null };

export interface WhatsAppAdapter {
  sendTemplate(to: string, t: TemplateMessage, ctx?: SendContext): Promise<SendResult>;
  /** Free-form inside the 24 h window; otherwise `fallback` template, else throws WindowClosedError. */
  sendInteractive(to: string, m: Interactive, opts?: SendContext & { fallback?: TemplateMessage }): Promise<SendResult>;
  sendText(to: string, text: string, opts?: SendContext & { fallback?: TemplateMessage }): Promise<SendResult>;
  sendDocument(to: string, d: DocumentMessage, ctx?: SendContext): Promise<SendResult>;
}

export type LogEntry = {
  direction: "out" | "in";
  waId: string;
  channel: "whatsapp" | "simulated";
  kind: string;
  body: unknown;
  requestId?: string | null;
  waMessageId?: string | null;
};

/** Normalised inbound message from the webhook. */
export type Inbound = {
  id: string;
  from: string;
  at: Date;
  kind: "text" | "reply" | "location" | "other";
  text?: string;
  replyId?: string; // button_reply / list_reply id, or template quick reply payload
  location?: { lat: number; lng: number };
  rawType: string;
};
