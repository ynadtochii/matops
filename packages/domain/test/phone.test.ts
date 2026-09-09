import { describe, expect, it } from "vitest";

import {
  academyCountry,
  countryForZone,
  DIAL_COUNTRIES,
  dialForCountry,
  FALLBACK_COUNTRY,
  splitE164,
  toE164,
} from "../src/phone";

describe("countryForZone", () => {
  it("opens the picker on the academy's own country", () => {
    expect(countryForZone("Europe/Lisbon")).toBe("PT");
    expect(countryForZone("America/Sao_Paulo")).toBe("BR");
  });

  it("maps every zone of a country that spans several", () => {
    expect(countryForZone("America/Los_Angeles")).toBe("US");
    expect(countryForZone("Pacific/Honolulu")).toBe("US");
    expect(countryForZone("Atlantic/Madeira")).toBe("PT");
  });

  it("falls back rather than guessing at an unmapped or missing zone", () => {
    expect(countryForZone("Antarctica/Troll")).toBe(FALLBACK_COUNTRY);
    expect(countryForZone(null)).toBe(FALLBACK_COUNTRY);
  });
});

describe("academyCountry", () => {
  it("takes the country the academy set over the one its zone implies", () => {
    expect(academyCountry("BR", "Europe/Lisbon")).toBe("BR");
  });

  it("falls back to the zone when no country is set", () => {
    expect(academyCountry(null, "Europe/Lisbon")).toBe("PT");
    expect(academyCountry("", "Europe/Lisbon")).toBe("PT");
  });

  it("ignores a country that is not one the picker offers", () => {
    expect(academyCountry("XX", "Europe/Lisbon")).toBe("PT");
  });

  it("falls back to the default when neither is usable", () => {
    expect(academyCountry(null, null)).toBe(FALLBACK_COUNTRY);
  });
});

describe("toE164", () => {
  it("joins the prefix to the digits and drops the punctuation", () => {
    expect(toE164("+351", "912 345 678")).toBe("+351912345678");
  });

  it("drops the national trunk zero", () => {
    expect(toE164("+44", "07911 123456")).toBe("+447911123456");
  });

  it("is empty while nothing has been typed", () => {
    expect(toE164("+351", "")).toBe("");
    expect(toE164("+351", "  -  ")).toBe("");
  });
});
describe("splitE164", () => {
  it("takes the longest matching prefix, not the first", () => {
    expect(splitE164("+351912345678", "US")).toEqual({
      iso: "PT",
      national: "912345678",
    });
  });

  it("keeps a number with no country under the fallback instead of re-homing it", () => {
    expect(splitE164("912345678", "PT")).toEqual({
      iso: "PT",
      national: "912345678",
    });
  });

  it("round-trips whatever toE164 produced", () => {
    const made = toE164("+49", "170 1234567");
    const { iso, national } = splitE164(made, "US");
    expect(toE164(dialForCountry(iso), national)).toBe(made);
  });
});

describe("the country list", () => {
  it("has no duplicate ISO codes", () => {
    const codes = DIAL_COUNTRIES.map((c) => c.iso);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("gives every country a plus-prefixed dial code", () => {
    for (const c of DIAL_COUNTRIES) {
      expect(c.dial).toMatch(/^\+[1-9]\d{0,3}$/);
    }
  });

  it("is sorted by name, which is the order the picker shows", () => {
    const names = DIAL_COUNTRIES.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
