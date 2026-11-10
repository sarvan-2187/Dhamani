import { describe, expect, it } from "vitest";
import { LOGIN_CODE_RE, newLoginCode, parseLoginMessage } from "../../lib/auth/login";
import { sign, unsign } from "../../lib/auth/session";
import { PATIENT_LABEL_RE } from "../../lib/requests/patient";
import { hospitalTokens, mentionsGroup, slipMatches } from "../../lib/requests/slip";
import { newSlug, requestCode, SLUG_RE } from "../../lib/requests/slug";
import { mentionsMoney } from "../../lib/safety/money";

describe("money detector (PRD 13)", () => {
  it.each(["₹500", "Rs 500", "rs. 2000", "Rupees", "UPI please", "gpay", "G Pay", "Paytm", "PhonePe", "account no 123", "IFSC", "charges", "fee", "Payment"])(
    "flags %s",
    (s) => expect(mentionsMoney(s)).toBe(true),
  );
  it.each(["Priya K.", "persons", "coffee", "Feeroz", "Ravi", "Thursday", ""])("does not flag %s", (s) => expect(mentionsMoney(s)).toBe(false));
});

describe("slip OCR matching (PRD 10.2)", () => {
  const hospital = "Kanchi Kamakoti Child Trust Hospital Blood Bank";
  it("ignores generic words when picking tokens", () => {
    expect(hospitalTokens(hospital)).toEqual(["kanchi", "kamakoti", "child", "trust"]);
  });
  it("matches a slip that names the hospital and the group", () => {
    expect(slipMatches("KANCHI KAMAKOTI CHILDS TRUST HOSP\nPatient: Ravi\nBlood group: B Positive", hospital, "B+")).toBe(true);
  });
  it("needs the group too", () => {
    expect(slipMatches("Kanchi Kamakoti Child Trust", hospital, "B+")).toBe(false);
    expect(slipMatches("Kanchi Kamakoti Child Trust  O+", hospital, "B+")).toBe(false);
  });
  it("needs most of the hospital words", () => {
    expect(slipMatches("Trust Hospital B+", hospital, "B+")).toBe(false);
  });
  it.each([
    ["O+", "Grp: O +ve", true],
    ["O-", "O NEG", true],
    ["AB+", "AB Positive", true],
    ["B+", "AB+", false], // AB is not B
    ["A-", "A Positive", false],
    ["bombay", "Bombay (Oh) phenotype", true],
  ] as const)("group %s in %j -> %s", (group, text, expected) => {
    expect(mentionsGroup(text, group)).toBe(expected);
  });
});

describe("reverse OTP codes (PRD 8.1)", () => {
  it("makes readable codes", () => {
    for (let i = 0; i < 50; i++) expect(newLoginCode()).toMatch(LOGIN_CODE_RE);
  });
  it.each([
    ["LOGIN DH-4821-7Q", "DH-4821-7Q"],
    ["login dh-4821-7q", "DH-4821-7Q"],
    ["  Login DH 4821 7Q ", "DH-4821-7Q"],
    ["LOGIN DH48217Q", "DH-4821-7Q"],
  ])("parses %j", (text, code) => expect(parseLoginMessage(text)).toBe(code));
  it.each(["JOIN", "LOGIN", "LOGIN 1234", "please LOGIN DH-4821-7Q"])("ignores %j", (text) => expect(parseLoginMessage(text)).toBeNull());
});

describe("session cookie signing", () => {
  const key = "k".repeat(32);
  it("round-trips and rejects tampering", () => {
    const s = sign("3f1c2b8e-0000-4000-8000-000000000001", key);
    expect(unsign(s, key)).toBe("3f1c2b8e-0000-4000-8000-000000000001");
    expect(unsign(s.replace("0001", "0002"), key)).toBeNull();
    expect(unsign(s, "x".repeat(32))).toBeNull();
    expect(unsign(undefined, key)).toBeNull();
    expect(unsign("no-dot", key)).toBeNull();
  });
});

describe("slugs and request codes", () => {
  it("are URL safe and unambiguous", () => {
    for (let i = 0; i < 50; i++) expect(newSlug()).toMatch(SLUG_RE);
    expect(requestCode("7q4kab23")).toBe("DH-7Q4K");
  });
});

describe("patient label: first name and initial only", () => {
  it.each(["Priya K.", "Priya K", "Priya", "பிரியா க.", "ప్రియ"])("accepts %s", (s) => expect(PATIENT_LABEL_RE.test(s)).toBe(true));
  it.each(["Priya Kumari Sharma", "Priya 9", "Priya, K", "Room 12"])("rejects %s", (s) => expect(PATIENT_LABEL_RE.test(s)).toBe(false));
});
