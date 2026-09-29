import { describe, expect, it } from "vitest";

import {
  AddMemberNoteSchema,
  CreateClassSchema,
  CreateClassTemplateSchema,
  EmailSchema,
  HttpUrlSchema,
  JoinAcademySchema,
  NameSchema,
  PhoneSchema,
  UpdateAcademySettingsSchema,
} from "../src";

const ZWSP = "​";
const RTL_OVERRIDE = "‮";

function ok<T>(result: { success: boolean; data?: T }): T {
  expect(result.success).toBe(true);
  return result.data as T;
}

describe("NameSchema", () => {
  it("collapses whitespace and trims", () => {
    expect(ok(NameSchema.safeParse("  Ana   Maria \n"))).toBe("Ana Maria");
  });

  it("strips zero-width, control and bidi-override characters", () => {
    expect(ok(NameSchema.safeParse(`Sa${ZWSP}mmy${RTL_OVERRIDE}`))).toBe(
      "Sammy",
    );
  });

  it("rejects a value that is only invisible characters", () => {
    expect(NameSchema.safeParse(ZWSP + ZWSP).success).toBe(false);
  });

  it("rejects a value over the length bound", () => {
    expect(NameSchema.safeParse("a".repeat(61)).success).toBe(false);
    expect(NameSchema.safeParse("a".repeat(100_000)).success).toBe(false);
  });

  it("keeps accents, apostrophes and hyphens", () => {
    expect(ok(NameSchema.safeParse("Renée O'Neill-Souza"))).toBe(
      "Renée O'Neill-Souza",
    );
  });
});

describe("PhoneSchema", () => {
  it("accepts common international formats", () => {
    for (const value of [
      "+380 50 999 88 77",
      "+1 (555) 123-4567",
      "5551234567",
      "044.123.45.67",
    ]) {
      expect(PhoneSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects letters, markup and injection payloads", () => {
    for (const value of [
      "<script>alert(1)</script>",
      "call me",
      "555 OR 1=1",
      "sam@example.com",
    ]) {
      expect(PhoneSchema.safeParse(value).success).toBe(false);
    }
  });

  it("rejects a number with too few digits", () => {
    expect(PhoneSchema.safeParse("+1 2").success).toBe(false);
  });

  it("stores one string for every spelling of the same number", () => {
    for (const value of [
      "+351 912 345 678",
      "+351-912.345.678",
      "+351912345678",
    ]) {
      expect(ok(PhoneSchema.safeParse(value))).toBe("+351912345678");
    }
  });

  it("holds a number that carries a country code to E.164", () => {
    expect(PhoneSchema.safeParse("+0351912345678").success).toBe(false);
    expect(PhoneSchema.safeParse(`+${"9".repeat(16)}`).success).toBe(false);
  });

  it("still takes a number with no country code, which the app still sends", () => {
    expect(ok(PhoneSchema.safeParse("(555) 123-4567"))).toBe("5551234567");
  });
});

describe("EmailSchema", () => {
  it("lower-cases and trims so one person is one identity", () => {
    expect(ok(EmailSchema.safeParse("  Sam@Example.COM "))).toBe(
      "sam@example.com",
    );
  });

  it("rejects a malformed address", () => {
    expect(EmailSchema.safeParse("sam@").success).toBe(false);
    expect(EmailSchema.safeParse("not an email").success).toBe(false);
  });
});

describe("HttpUrlSchema", () => {
  it("strips invisible characters before parsing the link", () => {
    const url = ok(HttpUrlSchema.safeParse(`https://example.com/a${ZWSP}b`));
    expect(url).toBe("https://example.com/ab");
    expect(url).not.toContain(ZWSP);
  });

  it("refuses a link whose direction is overridden", () => {
    const url = ok(
      HttpUrlSchema.safeParse(`https://example.com/${RTL_OVERRIDE}gnp.exe`),
    );
    expect(url).not.toContain(RTL_OVERRIDE);
  });

  it("still refuses a non-http scheme", () => {
    expect(HttpUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(HttpUrlSchema.safeParse("data:text/html,<b>x").success).toBe(false);
  });

  it("cannot be smuggled past the scheme check with an invisible", () => {
    expect(HttpUrlSchema.safeParse(`java${ZWSP}script:alert(1)`).success).toBe(
      false,
    );
  });

  it("accepts an ordinary link unchanged", () => {
    expect(ok(HttpUrlSchema.safeParse("https://example.com/maps"))).toBe(
      "https://example.com/maps",
    );
  });
});

describe("UpdateAcademySettingsSchema.mapUrl", () => {
  const parse = (mapUrl: string) =>
    UpdateAcademySettingsSchema.safeParse({ mapUrl }).success;

  it("accepts a share link from a map app", () => {
    expect(parse("https://maps.app.goo.gl/abc123")).toBe(true);
    expect(parse("https://www.google.com/maps/place/Gym/@50.4,30.5,17z")).toBe(
      true,
    );
    expect(parse("https://maps.apple.com/?ll=50.45,30.52")).toBe(true);
    expect(parse("https://www.openstreetmap.org/#map=19/50.45/30.52")).toBe(
      true,
    );
  });

  it("clears the pin when the field is emptied", () => {
    expect(parse("")).toBe(true);
  });

  it("rejects a link that is not a map", () => {
    expect(parse("https://evil.example.com/pay")).toBe(false);
    expect(parse("javascript:alert(1)")).toBe(false);
    expect(parse("not a url")).toBe(false);
  });

  it("rejects a map host smuggled into the userinfo", () => {
    expect(parse("https://maps.google.com@evil.example.com/")).toBe(false);
    expect(parse("https://google.com.evil.example.com/")).toBe(false);
  });

  it("rejects a map host behind a backslash, which a browser reads as a path", () => {
    expect(parse("https://evil.example.com\\.google.com/")).toBe(false);
    expect(parse("https://evil.example.com\\.maps.apple.com/")).toBe(false);
  });

  it("rejects google hosts that are not the map", () => {
    expect(parse("https://www.google.com/url?q=https://evil.example.com")).toBe(
      false,
    );
    expect(parse("https://sites.google.com/view/free-gym-membership")).toBe(
      false,
    );
    expect(parse("https://goo.gl/aaaaa")).toBe(false);
  });
});

describe("multi-line fields", () => {
  it("keeps paragraphs but drops control characters", () => {
    const parsed = ok(
      AddMemberNoteSchema.safeParse({
        memberId: "m1",
        body: `Demo Bank\r\nIBAN: DE89${ZWSP} 3704\n\n\n\nRef: 1234  `,
      }),
    );
    expect(parsed.body).toBe("Demo Bank\nIBAN: DE89 3704\n\nRef: 1234");
  });

  it("rejects a note that is blank once cleaned", () => {
    expect(
      AddMemberNoteSchema.safeParse({ memberId: "m1", body: ` ${ZWSP} ` })
        .success,
    ).toBe(false);
  });
});

describe("composed schemas still accept real input", () => {
  it("accepts a normal join", () => {
    expect(
      ok(
        JoinAcademySchema.safeParse({
          token: "abc123",
          firstName: " Sam ",
          lastName: "Lee",
          phone: "+380 50 111 22 33",
        }),
      ),
    ).toEqual({
      token: "abc123",
      firstName: "Sam",
      lastName: "Lee",
      phone: "+380501112233",
    });
  });
});

describe("session description", () => {
  const base = {
    title: "Open gym",
    date: "2026-09-01",
    startsAtMinutes: 600,
    durationMinutes: 60,
    timeZone: "Europe/Kyiv",
    capacity: 20,
  };

  it("rejects an unknown zone and accepts a real one", () => {
    expect(
      CreateClassSchema.safeParse({ ...base, timeZone: "Mars/Olympus" })
        .success,
    ).toBe(false);
    expect(CreateClassSchema.safeParse(base).success).toBe(true);
  });

  it("cleans a description the way other multi-line fields are cleaned", () => {
    const parsed = ok(
      CreateClassSchema.safeParse({
        ...base,
        description: `Bring a towel.\r\n\n\n\nMats${ZWSP} open at 7  `,
      }),
    );
    expect(parsed.description).toBe("Bring a towel.\n\nMats open at 7");
  });

  it("stops at the cap the column also holds", () => {
    const template = {
      title: "Open gym",
      daysOfWeek: [1],
      startsAtMinutes: 600,
      durationMinutes: 60,
      timeZone: "Europe/Kyiv",
      capacity: 20,
    };
    expect(
      CreateClassTemplateSchema.safeParse({
        ...template,
        description: "x".repeat(500),
      }).success,
    ).toBe(true);
    expect(
      CreateClassTemplateSchema.safeParse({
        ...template,
        description: "x".repeat(501),
      }).success,
    ).toBe(false);
  });

  it("keeps an absent description absent and an empty one nothing", () => {
    expect(ok(CreateClassSchema.safeParse(base)).description).toBeUndefined();
    expect(
      ok(CreateClassSchema.safeParse({ ...base, description: "   " }))
        .description,
    ).toBeNull();
  });
});
