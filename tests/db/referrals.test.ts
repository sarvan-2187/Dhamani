// Referrals (owner request 2026-11-10): JOIN <code> links a new donor to who invited them; a referral counts once
// that donor has a verified donation; coordinators see first name, city and counts and may ask for consent.
// Real database, synthetic numbers, WA_ALLOWLIST cleared so nothing can reach a real phone.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neon } from "@neondatabase/serverless";
import { loadReferralLeaders } from "../../lib/console/read";
import { askRecognitionConsent, ensureReferralCode, referralStats } from "../../lib/recognition/referral";
import { handleInbound } from "../../lib/wa/flows/handle";
import type { Inbound } from "../../lib/wa/types";

const sql = neon(process.env.DATABASE_URL!);
const A = "910000000963"; // referrer
const B = "910000000962"; // joins with A's code
const C = "910000000961"; // joins with an unknown code
const R = "910000000960"; // requester
const ALL = [A, B, C, R];
let hospitalId = "";
let n = 0;

const msg = (from: string, m: Partial<Inbound>): Inbound => ({ id: `ref-${Date.now()}-${n++}`, from, at: new Date(), kind: "text", rawType: "text", ...m });
const text = (from: string, t: string) => handleInbound(msg(from, { kind: "text", text: t }));
const tap = (from: string, id: string) => handleInbound(msg(from, { kind: "reply", replyId: id, rawType: "interactive" }));

/** The full onboarding (PRD 9.4), as in tests/db/onboarding.test.ts. */
async function onboard(wa: string, join: string) {
  await text(wa, join);
  await tap(wa, "ONB:LANG:en");
  await tap(wa, "ONB:AGREE");
  await text(wa, "Kavya");
  await tap(wa, "ONB:GROUP:O+");
  await text(wa, "05-08-1995");
  await tap(wa, "ONB:SEX:female");
  await tap(wa, "ONB:WEIGHT:55_plus");
  await handleInbound(msg(wa, { kind: "location", location: { lat: 13.05, lng: 80.25 }, rawType: "location" }));
  await tap(wa, "ONB:LAST:never");
  await tap(wa, "ONB:RADIUS:10");
  await tap(wa, "ONB:NIGHT:no");
}

async function cleanup() {
  const ids = (await sql`select id from requests where requester_wa_id = ${R}`).map((r) => r.id);
  await sql`delete from message_log where request_id = any(${ids}::uuid[]) or wa_id = any(${ALL}::text[])`;
  await sql`delete from requests where requester_wa_id = ${R}`;
  await sql`delete from audit_log where action like 'recognition_asked:%' and actor = 'test'`;
  await sql`update donors set referred_by = null where referred_by in (select id from donors where wa_id = any(${ALL}::text[]))`;
  await sql`delete from donors where wa_id = any(${ALL}::text[])`;
  await sql`delete from wa_conversations where wa_id = any(${ALL}::text[])`;
}

beforeAll(async () => {
  process.env.SIMULATION_MODE = "true";
  process.env.WA_ALLOWLIST = "";
  process.env.SESSION_SECRET ||= "s".repeat(32);
  process.env.WA_BUSINESS_NUMBER ||= "910000000000";
  [{ id: hospitalId }] = await sql`select id from hospitals where name = 'DEV ONLY Test Hospital A'`;
  await cleanup();
  await sql`
    insert into donors (wa_id, name, lang, abo, rh, dob, sex, weight_band, home_geog, radius_km, consent_version, is_synthetic)
    select ${A}, 'Arun', 'en', 'B', 'pos', '1990-01-01', 'male', '55_plus', geog, 10, 'test', true from hospitals where id = ${hospitalId}`;
});
afterAll(cleanup);

describe("referrals", () => {
  it("JOIN <code> links the new donor to the referrer; an unknown code links nobody", async () => {
    const [a] = await sql`select id from donors where wa_id = ${A}`;
    const code = await ensureReferralCode(a.id);
    expect(code).toMatch(/^R[A-Z0-9]{5}$/);
    expect(await ensureReferralCode(a.id)).toBe(code); // stable

    await onboard(B, `JOIN ${code}`);
    await onboard(C, "JOIN RZZZZZ");
    const rows = await sql`select wa_id, referred_by from donors where wa_id in (${B}, ${C}) order by wa_id desc`;
    expect(rows).toEqual([{ wa_id: B, referred_by: a.id }, { wa_id: C, referred_by: null }]);

    await text(B, "JOIN RZZZZZ"); // already registered: nothing changes
    const [b] = await sql`select referred_by from donors where wa_id = ${B}`;
    expect(b.referred_by).toBe(a.id);
    expect(await referralStats(a.id)).toEqual({ joined: 1, donated: 0 });
  });

  it("counts for coordinators only after a verified donation; first name, city and counts only", async () => {
    const [a] = await sql`select id from donors where wa_id = ${A}`;
    expect((await loadReferralLeaders()).some((l) => l.donorId === a.id)).toBe(false);

    const [r] = await sql`
      insert into requests (public_slug, requester_wa_id, hospital_id, patient_label, abo, rh, component, units, needed_by, expires_at, status)
      values ('refts001', ${R}, ${hospitalId}, 'Test T.', 'O', 'pos', 'whole_blood', 1, now() - interval '3 hours', now(), 'fulfilled')
      returning id`;
    await sql`
      insert into confirmations (request_id, donor_id, donor_said_donated, requester_marked_arrived, verified_at, followup_sent_at)
      select ${r.id}, id, true, true, now(), now() from donors where wa_id = ${B}`;

    const mine = (await loadReferralLeaders()).find((l) => l.donorId === a.id);
    expect(mine).toEqual({ donorId: a.id, firstName: "Arun", city: expect.any(String), joined: 1, donated: 1, consent: null, asked: false });
    expect(await referralStats(a.id)).toEqual({ joined: 1, donated: 1 });
  });

  it("asks for consent on WhatsApp and stores the donor's answer", async () => {
    const [a] = await sql`select id from donors where wa_id = ${A}`;
    expect(await askRecognitionConsent("test", a.id)).toBe(true);
    const [ask] = await sql`select body from message_log where wa_id = ${A} and direction = 'out' order by id desc limit 1`;
    expect(JSON.stringify(ask.body)).toContain("RECOG:YES");
    expect(JSON.stringify(ask.body)).toContain("no prize or payment");

    await tap(A, "RECOG:YES");
    const [d] = await sql`select recognition_consent from donors where wa_id = ${A}`;
    expect(d.recognition_consent).toBe(true);
  });

  it("STATUS includes the donor's invite link", async () => {
    await text(A, "STATUS");
    const [last] = await sql`select body from message_log where wa_id = ${A} and direction = 'out' order by id desc limit 1`;
    const [a] = await sql`select referral_code from donors where wa_id = ${A}`;
    expect(JSON.stringify(last.body)).toContain(`text=JOIN%20${a.referral_code}`);
  });
});
