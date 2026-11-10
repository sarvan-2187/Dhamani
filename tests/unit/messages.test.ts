import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ta from "../../messages/ta.json";
import te from "../../messages/te.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((out, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === "string" ? { ...out, [key]: v } : { ...out, ...flatten(v, key) };
  }, {});
}

const all = { en: flatten(en), ta: flatten(ta), te: flatten(te) };

describe("message files", () => {
  it.each(["ta", "te"] as const)("%s has exactly the same keys as en", (locale) => {
    expect(Object.keys(all[locale]).sort()).toEqual(Object.keys(all.en).sort());
  });

  it.each(Object.keys(all) as (keyof typeof all)[])("%s has no em dashes and no empty strings", (locale) => {
    for (const [key, value] of Object.entries(all[locale])) {
      expect(value, key).not.toContain("—");
      expect(value.trim(), key).not.toBe("");
    }
  });
});
