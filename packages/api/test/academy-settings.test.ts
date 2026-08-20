import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedAcademies } from "./helpers";

const A = "acad_settings_a";
const B = "acad_settings_b";
const OWNER_A = "u_settings_owner_a";
const STUDENT_A = "u_settings_student_a";
const OWNER_B = "u_settings_owner_b";

describe("academy settings", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: A,
        code: "700020",
        members: [
          { userId: OWNER_A, role: "owner", status: "active" },
          { userId: STUDENT_A, role: "student", status: "active" },
        ],
      },
      {
        id: B,
        code: "700021",
        members: [{ userId: OWNER_B, role: "owner", status: "active" }],
      },
    ]);
  });

  afterAll(() => h.close());

  it("stores the time zone and address, and reads them back on current", async () => {
    await h.as(OWNER_A, A).academy.updateSettings({
      timeZone: "Europe/Kyiv",
      address: "Sportyvna St 12, Kyiv",
    });

    const settings = await h.as(OWNER_A, A).academy.settings();
    expect(settings.timeZone).toBe("Europe/Kyiv");
    expect(settings.drifting).toEqual([]);

    const current = await h.as(STUDENT_A, A).academy.current();
    expect(current?.address).toBe("Sportyvna St 12, Kyiv");
    expect(current?.timeZone).toBe("Europe/Kyiv");
  });

  it("refuses a time zone the runtime cannot resolve", async () => {
    expect(
      await rejectionCode(
        h.as(OWNER_A, A).academy.updateSettings({ timeZone: "Europe/Kyv" }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("keeps settings owner-only", async () => {
    expect(await rejectionCode(h.as(STUDENT_A, A).academy.settings())).toBe(
      "FORBIDDEN",
    );
    expect(
      await rejectionCode(
        h.as(STUDENT_A, A).academy.updateSettings({ address: "anywhere" }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await rejectionCode(h.as(STUDENT_A, A).academy.remove({ confirm: "x" })),
    ).toBe("FORBIDDEN");
  });

  it("refuses a delete whose typed phrase does not name the academy", async () => {
    expect(
      await rejectionCode(
        h.as(OWNER_B, B).academy.remove({ confirm: "delete" }),
      ),
    ).toBe("BAD_REQUEST");
    expect(
      await rejectionCode(
        h.as(OWNER_B, B).academy.remove({ confirm: `delete Academy ${A}` }),
      ),
    ).toBe("BAD_REQUEST");

    expect(await h.as(OWNER_B, B).academy.current()).not.toBeNull();
  });

  it("soft-deletes on the exact phrase and hides the academy from everyone", async () => {
    const before = await h.as(OWNER_B, B).academy.current();
    expect(before?.name).toBe(`Academy ${B}`);

    await h.as(OWNER_B, B).academy.remove({ confirm: `DELETE  academy ${B} ` });

    expect(await h.as(OWNER_B, B).academy.current()).toBeNull();
    expect(await h.as(OWNER_B, B).academy.memberships()).toEqual([]);
    expect(
      await h.as(OWNER_B, null).academy.findByCode({ code: "700021" }),
    ).toBeNull();
    expect(await rejectionCode(h.as(OWNER_B, B).academy.settings())).toBe(
      "FORBIDDEN",
    );

    const row = await h.pg.query<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM "organization" WHERE id = $1`,
      [B],
    );
    expect(row.rows[0]?.deleted_at).not.toBeNull();
  });

  it("leaves other academies untouched", async () => {
    const current = await h.as(OWNER_A, A).academy.current();
    expect(current?.name).toBe(`Academy ${A}`);
    expect(
      await h.as(OWNER_A, A).academy.findByCode({ code: "700020" }),
    ).not.toBeNull();
  });
});
