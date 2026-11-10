import { describe, expect, it } from "vitest";
import { maskDigits } from "../../lib/console/read";
import { assignReplies } from "../../lib/console/simulation";

describe("maskDigits (console never shows phone numbers)", () => {
  it("keeps only the last 4 digits of any number-like run", () => {
    expect(maskDigits("919876543210")).toBe("••••3210");
    expect(maskDigits('{"family":"+91 98765 43210"}')).toBe('{"family":"••••3210"}');
    expect(maskDigits("DH-AB12 at 10:30, 2 units")).toBe("DH-AB12 at 10:30, 2 units");
  });
});

describe("assignReplies (simulation mix)", () => {
  it("splits by the percentages and leaves the rest silent", () => {
    const seq = [0.1, 0.65, 0.95, 0.59, 0.79, 0.8];
    let i = 0;
    expect(assignReplies(6, { donatePct: 60, notNowPct: 20 }, () => seq[i++])).toEqual([
      "donate", "not_now", "silent", "donate", "not_now", "silent",
    ]);
    expect(assignReplies(3, { donatePct: 0, notNowPct: 0 })).toEqual(["silent", "silent", "silent"]);
  });
});
