// PRD 9.2: "there must be no other code path that calls the Graph API". Enforced structurally.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["app", "lib", "components", "db", "scripts", "i18n"];
const SOURCE = /\.(ts|tsx|js|mjs)$/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? files(p) : SOURCE.test(e.name) ? [p.replace(/\\/g, "/")] : [];
  });
}

const all = ROOTS.flatMap((r) => files(r)).map((f) => ({ f, text: readFileSync(f, "utf8") }));

describe("WhatsApp boundary", () => {
  it("scans the source tree", () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it("only lib/wa/client.ts contains the Graph API host", () => {
    expect(all.filter((x) => x.text.includes("graph.facebook.com")).map((x) => x.f)).toEqual(["lib/wa/client.ts"]);
  });

  it("only lib/wa/adapter.ts imports the client", () => {
    const importers = all.filter((x) => /from\s+["'][^"']*wa\/client["']|from\s+["']\.\/client["']/.test(x.text)).map((x) => x.f);
    expect(importers).toEqual(["lib/wa/adapter.ts"]);
  });

  it("nothing outside lib/wa reads the WhatsApp token", () => {
    expect(all.filter((x) => x.text.includes("WA_ACCESS_TOKEN") && !x.f.startsWith("lib/wa/")).map((x) => x.f)).toEqual([]);
  });
});
