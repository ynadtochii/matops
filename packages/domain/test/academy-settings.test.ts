import { describe, expect, it } from "vitest";

import {
  academyMapUrl,
  deleteAcademyPhrase,
  driftingTemplateZones,
  FALLBACK_TIME_ZONE,
  isValidTimeZone,
  matchesDeleteAcademyPhrase,
  resolveAcademyTimeZone,
  timeZoneOptions,
} from "../src/academy-settings";

describe("time zone validation", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimeZone("Europe/Kyiv")).toBe(true);
    expect(isValidTimeZone("America/Sao_Paulo")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects typos and empty input", () => {
    expect(isValidTimeZone("Europe/Kyv")).toBe(false);
    expect(isValidTimeZone("GMT+2")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("offers a sorted, non-empty picker list of canonical zones", () => {
    const zones = timeZoneOptions();
    expect(zones.length).toBeGreaterThan(1);
    expect(zones).toContain("Europe/Warsaw");
    expect([...zones].sort((a, b) => a.localeCompare(b))).toEqual(zones);
  });

  it("folds a stored alias into the picker so it stays selected", () => {
    expect(timeZoneOptions()).not.toContain("Europe/Kyiv");
    const withAlias = timeZoneOptions("Europe/Kyiv");
    expect(withAlias).toContain("Europe/Kyiv");
    expect(withAlias).toContain("Europe/Kiev");
    expect([...withAlias].sort((a, b) => a.localeCompare(b))).toEqual(withAlias);
  });

  it("ignores an unusable current value", () => {
    expect(timeZoneOptions("Europe/Kyv")).toEqual(timeZoneOptions());
    expect(timeZoneOptions(null)).toEqual(timeZoneOptions());
  });
});

describe("resolveAcademyTimeZone", () => {
  it("prefers the stored setting", () => {
    expect(resolveAcademyTimeZone("Europe/Kyiv", "America/New_York")).toBe(
      "Europe/Kyiv",
    );
  });

  it("falls back to the template zone for an academy that never set one", () => {
    expect(resolveAcademyTimeZone(null, "America/New_York")).toBe(
      "America/New_York",
    );
  });

  it("falls back to UTC when neither is usable", () => {
    expect(resolveAcademyTimeZone(null, null)).toBe(FALLBACK_TIME_ZONE);
    expect(resolveAcademyTimeZone("Europe/Kyv", "Nowhere/Else")).toBe(
      FALLBACK_TIME_ZONE,
    );
  });
});

describe("driftingTemplateZones", () => {
  it("names only the zones that disagree, deduped and sorted", () => {
    expect(
      driftingTemplateZones("Europe/Kyiv", [
        "Europe/Kyiv",
        "Europe/Warsaw",
        "Europe/Kyiv",
        "America/New_York",
      ]),
    ).toEqual(["America/New_York", "Europe/Warsaw"]);
  });

  it("is empty when every template agrees", () => {
    expect(driftingTemplateZones("UTC", ["UTC", "UTC"])).toEqual([]);
    expect(driftingTemplateZones("UTC", [])).toEqual([]);
  });
});

describe("academyMapUrl", () => {
  it("builds a search link from the typed address", () => {
    expect(academyMapUrl("Sportyvna St 12, Kyiv")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Sportyvna%20St%2012%2C%20Kyiv",
    );
  });

  it("is null when there is no address to search for", () => {
    expect(academyMapUrl(null)).toBeNull();
    expect(academyMapUrl("")).toBeNull();
    expect(academyMapUrl("   ")).toBeNull();
  });
});

describe("delete confirmation", () => {
  it("asks for `delete <name>`", () => {
    expect(deleteAcademyPhrase("Alma beta")).toBe("delete Alma beta");
  });

  it("forgives case and stray whitespace", () => {
    expect(matchesDeleteAcademyPhrase("DELETE alma beta", "Alma beta")).toBe(
      true,
    );
    expect(
      matchesDeleteAcademyPhrase("  delete  Alma   beta ", "Alma beta"),
    ).toBe(true);
  });

  it("refuses the wrong academy, a bare verb, or an empty box", () => {
    expect(matchesDeleteAcademyPhrase("delete Alma", "Alma beta")).toBe(false);
    expect(matchesDeleteAcademyPhrase("delete", "Alma beta")).toBe(false);
    expect(matchesDeleteAcademyPhrase("", "Alma beta")).toBe(false);
    expect(matchesDeleteAcademyPhrase("Alma beta", "Alma beta")).toBe(false);
  });
});
