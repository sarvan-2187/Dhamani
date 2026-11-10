import { describe, expect, it } from "vitest";
import { mapDirectoryRecords } from "../../db/seed/import-hospitals";
import { HOSPITAL_COLUMNS, parseCsv, parseHospitals, toCsv } from "../../db/seed/csv";

// Synthetic fixture records shaped like the data.gov.in directory (not real blood centres).
const rec = (over: Record<string, string>) => ({
  _blood_bank_name: "Fixture Blood Centre",
  _state: "Tamil Nadu",
  _district: "Chennai",
  _city: "Chennai",
  _address: "1 Fixture Road",
  pincode: "600001",
  _license__: "FIX/123",
  _apheresis: "YES",
  _latitude: "13.05",
  _longitude: "80.25",
  _contact_no: "0000000000",
  _email: "fixture@example.invalid",
  ...over,
});

describe("mapDirectoryRecords", () => {
  it("maps a good record and drops contact details", () => {
    const { rows } = mapDirectoryRecords([rec({})]);
    expect(rows).toEqual([
      {
        name: "Fixture Blood Centre",
        blood_centre_licence: "FIX/123",
        address: "1 Fixture Road, 600001",
        city: "Chennai",
        lat: 13.05,
        lng: 80.25,
        eraktkosh_url: null,
        has_apheresis: true,
      },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/0000000000|example\.invalid/);
  });

  it.each([
    ["YES", true],
    ["yes ", true],
    ["No", false],
    ["NA", false],
    ["", false],
    ["2", false],
  ])("apheresis %j -> %s", (value, expected) => {
    expect(mapDirectoryRecords([rec({ _apheresis: value })]).rows[0].has_apheresis).toBe(expected);
  });

  it("counts unclear apheresis values", () => {
    expect(mapDirectoryRecords([rec({ _apheresis: "2" })]).stats.apheresisUnclear).toBe(1);
  });

  it.each([
    ["zero coordinates", { _latitude: "0", _longitude: "0" }],
    ["empty coordinates", { _latitude: "", _longitude: "" }],
    ["text coordinates", { _latitude: "NA", _longitude: "NA" }],
    ["coordinates in another state", { _latitude: "28.61", _longitude: "77.20" }],
    ["swapped lat/lng", { _latitude: "80.25", _longitude: "13.05" }],
  ])("skips %s", (_, over) => {
    const { rows, stats } = mapDirectoryRecords([rec(over)]);
    expect(rows).toEqual([]);
    expect(stats.byState["Tamil Nadu"].badCoords).toBe(1);
  });

  it("keeps only the five states", () => {
    const { rows } = mapDirectoryRecords([
      rec({ _state: "Maharashtra", _latitude: "19.07", _longitude: "72.87" }),
      rec({ _state: " telangana ", _blood_bank_name: "T", _latitude: "17.38", _longitude: "78.48" }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(["T"]);
  });

  it("skips duplicate name + city (case insensitive) and missing fields", () => {
    const { rows, stats } = mapDirectoryRecords([rec({}), rec({ _blood_bank_name: "FIXTURE blood centre" }), rec({ _address: " " })]);
    expect(rows).toHaveLength(1);
    expect(stats.byState["Tamil Nadu"]).toMatchObject({ source: 3, kept: 1, duplicate: 1, missingFields: 1 });
  });

  it("treats NA licence and pincode as empty, and falls back to district for city", () => {
    const { rows } = mapDirectoryRecords([rec({ _license__: "NA", pincode: "NA", _city: "" })]);
    expect(rows[0]).toMatchObject({ blood_centre_licence: null, address: "1 Fixture Road", city: "Chennai" });
  });
});

describe("toCsv", () => {
  it("round-trips commas and quotes through parseCsv and parseHospitals", () => {
    const rows = mapDirectoryRecords([rec({ _address: 'No. 5, "Main" Road\nNear bus stand' })]).rows;
    const text = toCsv([[...HOSPITAL_COLUMNS], ...rows.map((h) => HOSPITAL_COLUMNS.map((c) => h[c]))]);
    expect(parseCsv(text)[1][2]).toBe('No. 5, "Main" Road Near bus stand, 600001');
    expect(parseHospitals(text)).toEqual(rows);
  });
});
