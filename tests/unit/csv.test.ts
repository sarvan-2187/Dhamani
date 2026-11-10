import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOSPITAL_COLUMNS, parseCsv, parseHospitals } from "../../db/seed/csv";

const header = HOSPITAL_COLUMNS.join(",");

describe("parseCsv", () => {
  it("handles quoted commas, escaped quotes, CRLF and blank lines", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("keeps a last line without a trailing newline", () => {
    expect(parseCsv("a,b\n1,")).toEqual([["a", "b"], ["1", ""]]);
  });
});

describe("parseHospitals", () => {
  it("parses the shipped file, keeps the two DEV ONLY demo rows, and has unique name + city", () => {
    const rows = parseHospitals(readFileSync("db/seed/hospitals.csv", "utf8"));
    const dev = rows.filter((r) => r.name.startsWith("DEV ONLY"));
    expect(dev.map((r) => [r.name, r.has_apheresis])).toEqual([
      ["DEV ONLY Test Hospital A", true],
      ["DEV ONLY Test Hospital B", false],
      ["DEV ONLY Test Hospital C", false], // Madhurawada, Visakhapatnam (owner testing, 2026-11-09)
    ]);
    expect(dev[0]).toMatchObject({ lat: 13.05, lng: 80.25, city: "Chennai" });
    const keys = rows.map((r) => `${r.name.toLowerCase()}|${r.city.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("rejects a wrong header", () => {
    expect(() => parseHospitals("name,address\nX,Y")).toThrow(/header/);
  });

  it.each([
    ["bad lat", "H,,Addr,Chennai,abc,80.2,,true", /bad lat/],
    ["missing lng", "H,,Addr,Chennai,13.0,,,true", /bad lng/],
    ["apheresis not boolean", "H,,Addr,Chennai,13.0,80.2,,yes", /has_apheresis/],
    ["missing city", "H,,Addr,,13.0,80.2,,true", /required/],
    ["wrong column count", "H,,Addr,Chennai,13.0", /8 columns/],
  ])("rejects %s", (_, line, err) => {
    expect(() => parseHospitals(`${header}\n${line}`)).toThrow(err);
  });
});
