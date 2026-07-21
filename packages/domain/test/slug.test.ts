import { describe, expect, it } from "vitest";

import { slugify } from "../src/slug";

describe("slugify", () => {
  it("lowercases and dashes spaces", () => {
    expect(slugify("Gracie Barra HQ")).toBe("gracie-barra-hq");
  });

  it("strips accents and punctuation", () => {
    expect(slugify("Académie São Paulo!")).toBe("academie-sao-paulo");
  });

  it("collapses runs and trims dashes", () => {
    expect(slugify("  --Team   Alpha--  ")).toBe("team-alpha");
  });

  it("falls back to 'academy' when nothing usable remains", () => {
    expect(slugify("!!!")).toBe("academy");
    expect(slugify("")).toBe("academy");
  });

  it("caps length at 48 characters", () => {
    expect(slugify("a".repeat(100)).length).toBe(48);
  });
});
