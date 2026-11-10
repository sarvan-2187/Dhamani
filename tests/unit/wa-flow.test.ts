// Whole conversations through the pure router, with an in-memory store standing in for the database.
import { describe, expect, it } from "vitest";
import { route, type ConvView, type DonorView } from "../../lib/wa/flows/router";
import { render, type Reply } from "../../lib/wa/flows/reply";
import type { DonorInput } from "../../lib/wa/flows/onboarding";
import type { Inbound, Lang } from "../../lib/wa/types";

const NOW = new Date("2026-11-10T12:00:00+05:30");

function session(start?: { donor?: DonorView }) {
  let conv: ConvView = null;
  let donor: DonorView | null = start?.donor ?? null;
  let saved: DonorInput | null = null;
  let last: { lang: Lang; replies: Reply[] } = { lang: "en", replies: [] };
  let n = 0;

  function send(input: Partial<Inbound>) {
    const m = { id: `w${n++}`, from: "910000000001", at: NOW, rawType: "x", kind: "text", ...input } as Inbound;
    const out = route(m, conv, donor, NOW);
    for (const e of out.effects) {
      if (e.type === "save_donor") {
        saved = e.donor;
        const d = e.donor;
        donor = { name: d.name, lang: d.lang, group: d.group, sex: d.sex, lastDonatedOn: d.lastDonatedOn, pausedUntil: null, stoppedAt: null, consentVersion: d.consentVersion, isSynthetic: false };
      }
      if (e.type === "pause" && donor) donor = { ...donor, pausedUntil: e.until };
      if (e.type === "stop" && donor) donor = { ...donor, stoppedAt: NOW };
    }
    if (out.conv !== "keep") conv = out.conv ? { flow: "onboarding", step: out.conv.step, data: out.conv.data } : null;
    last = { lang: out.lang, replies: out.replies };
    return out;
  }
  const text = (t: string) => send({ kind: "text", text: t });
  const tap = (id: string) => send({ kind: "reply", replyId: id });
  const pin = (lat: number, lng: number) => send({ kind: "location", location: { lat, lng } });
  const step = () => (conv as { step?: string } | null)?.step ?? null;
  const keys = () => last.replies.map((r) => (r.type === "language" ? "language" : r.key));
  const said = () =>
    last.replies
      .map((r) => render(r, last.lang))
      .map((r) => (r.kind === "text" ? r.text : r.interactive.body))
      .join("\n");
  return { text, tap, pin, step, keys, said, saved: () => saved, donor: () => donor, lang: () => last.lang };
}

type S = ReturnType<typeof session>;

function joinUntilDob(s: S, group: string, lang: Lang = "en") {
  s.text("JOIN");
  s.tap(`ONB:LANG:${lang}`);
  s.tap("ONB:AGREE");
  s.text("Asha");
  s.tap(`ONB:GROUP:${group}`);
}

function completeUntilNight(s: S, group: string, lang: Lang = "en") {
  joinUntilDob(s, group, lang);
  s.text("05-08-1995");
  s.tap("ONB:SEX:female");
  s.tap("ONB:WEIGHT:55_plus");
  s.pin(13.0827, 80.2707);
  s.tap("ONB:LAST:never");
  s.tap("ONB:RADIUS:10");
  return s.tap("ONB:NIGHT:yes");
}

describe("onboarding (PRD 9.4)", () => {
  it("full JOIN in Tamil for an Rh-negative donor asks the rare registry question and saves", () => {
    const s = session();
    s.text("JOIN");
    expect(s.keys()).toEqual(["language"]);
    s.tap("ONB:LANG:ta");
    expect(s.lang()).toBe("ta");
    expect(s.keys()).toEqual(["consent"]);
    completeUntilNight(s, "O-", "ta");
    expect(s.step()).toBe("rare");
    s.tap("ONB:RARE:yes");
    expect(s.step()).toBeNull();
    expect(s.keys()).toEqual(["done"]);
    expect(s.said()).toContain("Asha");
    expect(s.saved()).toEqual({
      lang: "ta",
      name: "Asha",
      group: "O-",
      dob: "1995-08-05",
      sex: "female",
      weightBand: "55_plus",
      lat: 13.085, // 13.0827 rounded to 0.005
      lng: 80.27, // 80.2707 rounded to 0.005
      lastDonatedOn: null,
      radiusKm: 10,
      nightOk: true,
      rareRegistryOptIn: true,
      consentVersion: "2026-11-v1",
    });
  });

  it("an Rh-positive donor is never asked about the rare registry", () => {
    const s = session();
    completeUntilNight(s, "B+");
    expect(s.keys()).toEqual(["done"]);
    expect(s.saved()?.rareRegistryOptIn).toBe(false);
  });

  it("a Bombay donor is asked about the rare registry", () => {
    const s = session();
    completeUntilNight(s, "bombay");
    expect(s.step()).toBe("rare");
  });

  it("Not sure ends with the advice to get typed", () => {
    const s = session();
    joinUntilDob(s, "unsure");
    expect(s.keys()).toEqual(["notSureEnd"]);
    expect(s.step()).toBeNull();
  });

  it("age 18 to 65 on the day of joining (IST)", () => {
    const ok = session();
    joinUntilDob(ok, "A+");
    ok.text("10-11-2008"); // 18 today
    expect(ok.step()).toBe("sex");
    const young = session();
    joinUntilDob(young, "A+");
    young.text("11-11-2008"); // 17
    expect(young.keys()).toEqual(["ageEnd"]);
    const old = session();
    joinUntilDob(old, "A+");
    old.text("10-11-1960"); // 66 today
    expect(old.keys()).toEqual(["ageEnd"]);
  });

  it("re-asks on an invalid date of birth without losing progress", () => {
    const s = session();
    joinUntilDob(s, "A+");
    for (const bad of ["1995-08-05", "31-02-1995", "tomorrow"]) {
      s.text(bad);
      expect(s.keys()).toEqual(["dobInvalid"]);
      expect(s.step()).toBe("dob");
    }
  });

  it("under 45 kg ends politely", () => {
    const s = session();
    joinUntilDob(s, "A+");
    s.text("05-08-1995");
    s.tap("ONB:SEX:male");
    s.tap("ONB:WEIGHT:under45");
    expect(s.keys()).toEqual(["weightEnd"]);
    expect(s.step()).toBeNull();
  });

  it("asks for a location pin when text is sent instead", () => {
    const s = session();
    joinUntilDob(s, "A+");
    s.text("05-08-1995");
    s.tap("ONB:SEX:male");
    s.tap("ONB:WEIGHT:45_54");
    s.text("Anna Nagar");
    expect(s.keys()).toEqual(["locationInvalid"]);
    expect(s.step()).toBe("location");
  });

  it("last donation: accepts a date, rejects the future and nonsense", () => {
    const s = session();
    joinUntilDob(s, "A+");
    s.text("05-08-1995");
    s.tap("ONB:SEX:male");
    s.tap("ONB:WEIGHT:45_54");
    s.pin(17.385, 78.4867);
    s.text("01-12-2026");
    expect(s.keys()).toEqual(["lastDonationFuture"]);
    s.text("soon");
    expect(s.keys()).toEqual(["lastDonationInvalid"]);
    s.text("01/06/2026");
    expect(s.step()).toBe("radius");
  });

  it("re-asks the current question on a typed answer or a stale button", () => {
    const s = session();
    joinUntilDob(s, "A+");
    s.text("05-08-1995");
    s.text("female"); // sex needs a button
    expect(s.keys()).toEqual(["askSex"]);
    s.tap("ONB:RADIUS:5"); // a button from another step
    expect(s.keys()).toEqual(["askSex"]);
    expect(s.step()).toBe("sex");
  });

  it("rejects a name that is not a name, accepts Indic script", () => {
    const s = session();
    s.text("JOIN");
    s.tap("ONB:LANG:en");
    s.tap("ONB:AGREE");
    s.text("12345");
    expect(s.keys()).toEqual(["nameInvalid"]);
    s.text("பிரியா");
    expect(s.step()).toBe("group");
  });

  it("accepts the QR prefilled text and lowercase", () => {
    const s = session();
    s.text("join Dhamani");
    expect(s.step()).toBe("lang");
  });
});

describe("commands (PRD 9.6)", () => {
  const registered = (): DonorView => ({
    name: "Ravi",
    lang: "en",
    group: "O+",
    sex: "male",
    lastDonatedOn: "2026-10-01",
    pausedUntil: null,
    stoppedAt: null,
    consentVersion: "2026-11-v1",
    isSynthetic: false,
  });

  it("JOIN when already registered says so", () => {
    const s = session({ donor: registered() });
    s.text("JOIN");
    expect(s.keys()).toEqual(["alreadyRegistered"]);
    expect(s.step()).toBeNull();
  });

  it("UPDATE restarts from blood group and keeps name and language", () => {
    const s = session({ donor: registered() });
    s.text("update");
    expect(s.step()).toBe("group");
    s.tap("ONB:GROUP:A+");
    s.text("05-08-1990");
    s.tap("ONB:SEX:male");
    s.tap("ONB:WEIGHT:55_plus");
    s.pin(13, 80.2);
    s.tap("ONB:LAST:never");
    s.tap("ONB:RADIUS:20");
    s.tap("ONB:NIGHT:no");
    expect(s.saved()).toMatchObject({ name: "Ravi", lang: "en", group: "A+", radiusKm: 20, consentVersion: "2026-11-v1" });
  });

  it("STATUS shows name, group, alerts and the next possible donation date", () => {
    const s = session({ donor: registered() });
    s.text("STATUS");
    expect(s.said()).toContain("Name: Ravi");
    expect(s.said()).toContain("Blood group: O+");
    expect(s.said()).toContain("Alerts: On");
    expect(s.said()).toContain("From 30 Dec 2026"); // 1 Oct + 90 days, male
  });

  it("STATUS for a donor who never donated: any time", () => {
    const s = session({ donor: { ...registered(), lastDonatedOn: null, sex: "female" } });
    s.text("STATUS");
    expect(s.said()).toContain("Any time");
  });

  it("PAUSE 30 pauses for 30 days; STATUS then shows it", () => {
    const s = session({ donor: registered() });
    s.text("PAUSE 30");
    expect(s.donor()?.pausedUntil?.getTime()).toBe(NOW.getTime() + 30 * 86_400_000);
    expect(s.said()).toContain("10 Dec 2026");
    s.text("STATUS");
    expect(s.said()).toContain("Paused until 10 Dec 2026");
  });

  it("PAUSE alone offers 7, 30 and 90 days; the buttons work", () => {
    const s = session({ donor: registered() });
    s.text("pause");
    expect(s.keys()).toEqual(["pauseAsk"]);
    s.tap("CMD:PAUSE:7");
    expect(s.donor()?.pausedUntil?.getTime()).toBe(NOW.getTime() + 7 * 86_400_000);
  });

  it.each(["PAUSE 0", "PAUSE 366", "PAUSE soon", "PAUSE -3"])("%s is rejected", (cmd) => {
    const s = session({ donor: registered() });
    s.text(cmd);
    expect(s.keys()).toEqual(["pauseInvalid"]);
    expect(s.donor()?.pausedUntil).toBeNull();
  });

  it("STOP stops alerts; then STATUS says not registered and JOIN starts again", () => {
    const s = session({ donor: registered() });
    s.text("STOP");
    expect(s.keys()).toEqual(["stopped"]);
    expect(s.donor()?.stoppedAt).toEqual(NOW);
    s.text("STATUS");
    expect(s.keys()).toEqual(["notRegistered"]);
    s.text("JOIN");
    expect(s.step()).toBe("lang");
  });

  it("STOP during onboarding cancels it, in the chosen language", () => {
    const s = session();
    s.text("JOIN");
    s.tap("ONB:LANG:te");
    s.text("STOP");
    expect(s.keys()).toEqual(["cancelled"]);
    expect(s.lang()).toBe("te");
    expect(s.step()).toBeNull();
  });

  it("HELP during onboarding keeps the place", () => {
    const s = session();
    joinUntilDob(s, "A+");
    s.text("help");
    expect(s.keys()).toEqual(["help"]);
    expect(s.step()).toBe("dob");
  });

  it("commands that need a profile tell unregistered people to JOIN", () => {
    for (const cmd of ["STATUS", "PAUSE 30", "UPDATE"]) {
      const s = session();
      s.text(cmd);
      expect(s.keys()).toEqual(["notRegistered"]);
    }
  });

  it("anything else: not registered, or not understood", () => {
    const a = session();
    a.text("hello");
    expect(a.keys()).toEqual(["notRegistered"]);
    const b = session({ donor: registered() });
    b.text("hello");
    expect(b.keys()).toEqual(["unknown"]);
  });
});
