import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildCertificate } from "../../lib/recognition/certificate";
import { CERT_NAME_RE, signMeToken, tierFor, verifyMeToken } from "../../lib/recognition/rules";
import { parseCommand } from "../../lib/wa/flows/commands";
import { startJoin } from "../../lib/wa/flows/onboarding";
import { route } from "../../lib/wa/flows/router";
import type { Inbound } from "../../lib/wa/types";

const KEY = "k".repeat(32);
const ID = "6dbfa24e-3779-47ad-9779-26ec94f52559";
const NOW = new Date("2026-11-10T06:00:00Z");

describe("Lifegiver tiers (PRD 10.4: 1, 3, 5, 10)", () => {
  it("is the highest badge reached", () => {
    expect([0, 1, 2, 3, 4, 5, 9, 10, 25].map(tierFor)).toEqual([0, 1, 1, 3, 3, 5, 5, 10, 10]);
  });
});

describe("certificate name (English letters only)", () => {
  it("accepts English spellings and refuses other scripts, digits and empty", () => {
    for (const ok of ["SARVAN", "Priya K.", "Anne-Marie D'Souza"]) expect(CERT_NAME_RE.test(ok), ok).toBe(true);
    for (const bad of ["ரவி", "రవి", "R4vi", "", " Ravi", "x".repeat(41)]) expect(CERT_NAME_RE.test(bad), bad).toBe(false);
  });
});

describe("/me link token (PRD 8.2: HMAC, 24 h)", () => {
  it("round-trips, expires after 24 h, and rejects tampering or another key", () => {
    const t = signMeToken(ID, NOW, KEY);
    expect(verifyMeToken(t, NOW, KEY)).toBe(ID);
    expect(verifyMeToken(t, new Date(NOW.getTime() + 23.9 * 3_600_000), KEY)).toBe(ID);
    expect(verifyMeToken(t, new Date(NOW.getTime() + 24.1 * 3_600_000), KEY)).toBeNull();
    expect(verifyMeToken(t, NOW, "z".repeat(32))).toBeNull();
    const [, exp, mac] = signMeToken("00000000-0000-0000-0000-000000000000", NOW, KEY).split(".");
    expect(verifyMeToken(`${ID}.${exp}.${mac}`, NOW, KEY)).toBeNull(); // another donor's signature
    expect(verifyMeToken(undefined, NOW, KEY)).toBeNull();
  });
});

describe("certificate PDF (PRD 11)", () => {
  it("is a one-page PDF and survives centre names with accents or other scripts", async () => {
    const bytes = await buildCertificate({ name: "Priya K.", date: "10 Nov 2026", centre: "Govt. Général Hospital – கோவை", code: "DH-AB12" });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("Dhamani donation certificate DH-AB12");
  });
});

describe("router: certificate name step (M8)", () => {
  const text = (t: string): Inbound => ({ id: "x", from: "910000000001", at: NOW, kind: "text", text: t, rawType: "text" });
  const conv = { flow: "cert_name", step: "ask", data: {} };

  it("saves an English spelling and clears the step", () => {
    expect(route(text("  Ravi   K "), conv, null, NOW)).toMatchObject({ effects: [{ type: "cert_name", name: "Ravi K" }], conv: null });
  });
  it("asks again for other scripts and keeps the step", () => {
    expect(route(text("ரவி"), conv, null, NOW)).toMatchObject({ replies: [{ key: "certNameInvalid" }], effects: [], conv: "keep" });
  });
  it("commands still work during the step", () => {
    expect(route(text("HELP"), conv, null, NOW).replies[0]).toMatchObject({ key: "help" });
  });
});

describe("referral commands (owner request 2026-11-10)", () => {
  const msg = (m: Partial<Inbound>): Inbound => ({ id: "x", from: "910000000001", at: NOW, kind: "text", rawType: "text", ...m });
  it("JOIN carries a referral code only when it looks like one", () => {
    expect(parseCommand(msg({ text: "join r7k2qx" }))).toEqual({ name: "JOIN", ref: "R7K2QX" });
    expect(parseCommand(msg({ text: "JOIN Dhamani" }))).toEqual({ name: "JOIN", ref: undefined });
    expect(parseCommand(msg({ text: "JOIN" }))).toEqual({ name: "JOIN", ref: undefined });
  });
  it("the code survives onboarding into the saved donor", () => {
    expect(startJoin("R7K2QX").state?.data).toEqual({ mode: "join", ref: "R7K2QX" });
    expect(startJoin().state?.data).toEqual({ mode: "join" });
  });
  it("consent buttons answer with a thank-you and an effect", () => {
    const yes = route(msg({ kind: "reply", replyId: "RECOG:YES", rawType: "interactive" }), null, null, NOW);
    expect(yes).toMatchObject({ replies: [{ key: "recognitionYesThanks" }], effects: [{ type: "recognition", yes: true }] });
    const no = route(msg({ kind: "reply", replyId: "RECOG:NO", rawType: "interactive" }), null, null, NOW);
    expect(no).toMatchObject({ replies: [{ key: "recognitionNoThanks" }], effects: [{ type: "recognition", yes: false }] });
  });
});
