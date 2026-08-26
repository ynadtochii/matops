import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { resetRateLimits } from "../src/rate-limit";
import { harness, rejectionCode, seedAcademies, seedClasses } from "./helpers";

const A = "academy_A";
const OWNER = "u_owner";
const COACH = "u_coach";
const CLASS_NOW = "aaaaaaaa-0000-4000-8000-000000000001";
const CLASS_LATER = "aaaaaaaa-0000-4000-8000-000000000002";

const VISITOR = {
  firstName: "Ana",
  lastName: "Silva",
  phone: "+351911111111",
  consent: true as const,
};

function from(ip: string): Headers {
  return new Headers({ "x-forwarded-for": ip });
}

let open: Harness | null = null;

beforeEach(() => resetRateLimits());

afterEach(async () => {
  await open?.close();
  open = null;
});

async function base(): Promise<Harness> {
  const h = await harness();
  open = h;
  await seedAcademies(h.pg, [
    {
      id: A,
      code: "100001",
      members: [
        { userId: OWNER, role: "owner", status: "active" },
        { userId: COACH, role: "instructor", status: "active" },
      ],
    },
  ]);
  return h;
}

interface LeadRow {
  first_name: string;
  last_name: string;
  visit_count: number;
  class_id: string | null;
}

async function leads(h: Harness): Promise<LeadRow[]> {
  const res = await h.pg.query<LeadRow>(
    `SELECT first_name, last_name, visit_count, class_id FROM "drop_in"`,
  );
  return res.rows;
}

describe("dropIn.submit, the stranger-writable insert behind the wall poster", () => {
  it("takes a walk-in's details with no account at all", async () => {
    const h = await base();
    const res = await h
      .as("nobody", null, from("1.1.1.1"))
      .dropIn.submit({ academyId: A, ...VISITOR });

    expect(res).toEqual({ ok: true, firstVisit: true });
    expect(await leads(h)).toMatchObject([
      { first_name: "Ana", visit_count: 1 },
    ]);
  });

  it("keeps a returning walk-in on one row instead of making a second", async () => {
    const h = await base();
    const caller = h.as("nobody", null, from("1.1.1.1"));
    await caller.dropIn.submit({ academyId: A, ...VISITOR });
    await caller.dropIn.submit({
      academyId: A,
      ...VISITOR,
      lastName: "Silva-Costa",
    });

    const rows = await leads(h);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.last_name).toBe("Silva-Costa");
  });

  it("does not count a second form fill for the same class as a second visit", async () => {
    const h = await base();
    await seedClasses(h.pg, [
      {
        id: CLASS_NOW,
        academyId: A,
        instructorId: COACH,
        startsInMinutes: -10,
        durationMinutes: 60,
      },
    ]);
    const caller = h.as("nobody", null, from("1.1.1.1"));
    await caller.dropIn.submit({ academyId: A, ...VISITOR });
    const second = await caller.dropIn.submit({ academyId: A, ...VISITOR });

    expect(second.firstVisit).toBe(true);
    expect((await leads(h))[0]?.visit_count).toBe(1);
  });

  it("counts a second visit when it is a different class", async () => {
    const h = await base();
    await seedClasses(h.pg, [
      {
        id: CLASS_NOW,
        academyId: A,
        instructorId: COACH,
        startsInMinutes: -10,
        durationMinutes: 30,
      },
      {
        id: CLASS_LATER,
        academyId: A,
        instructorId: COACH,
        startsInMinutes: 45,
        durationMinutes: 60,
      },
    ]);
    const caller = h.as("nobody", null, from("1.1.1.1"));
    await caller.dropIn.submit({ academyId: A, ...VISITOR });
    await h.pg.exec(
      `UPDATE "class" SET starts_at = now() - interval '80 minutes' WHERE id = '${"CLASS_NOW_ID"}';`.replace(
        "CLASS_NOW_ID",
        CLASS_NOW,
      ),
    );
    const second = await caller.dropIn.submit({ academyId: A, ...VISITOR });

    expect(second.firstVisit).toBe(false);
    expect((await leads(h))[0]?.visit_count).toBe(2);
    expect(await leads(h)).toHaveLength(1);
  });

  it("attaches the class that is on right now", async () => {
    const h = await base();
    await seedClasses(h.pg, [
      {
        id: CLASS_NOW,
        academyId: A,
        instructorId: COACH,
        startsInMinutes: -10,
        durationMinutes: 60,
      },
    ]);
    await h
      .as("nobody", null, from("1.1.1.1"))
      .dropIn.submit({ academyId: A, ...VISITOR });

    expect((await leads(h))[0]?.class_id).toBe(CLASS_NOW);
  });

  it("leaves the class empty when nothing is on", async () => {
    const h = await base();
    await h
      .as("nobody", null, from("1.1.1.1"))
      .dropIn.submit({ academyId: A, ...VISITOR });
    expect((await leads(h))[0]?.class_id).toBeNull();
  });

  it("refuses a gym that does not exist, writing nothing", async () => {
    const h = await base();
    expect(
      await rejectionCode(
        h
          .as("nobody", null, from("1.1.1.1"))
          .dropIn.submit({ academyId: "org_nope", ...VISITOR }),
      ),
    ).toBe("NOT_FOUND");
    expect(await leads(h)).toHaveLength(0);
  });

  it("keeps a stranger's lead out of another gym's list", async () => {
    const h = await base();
    await h
      .as("nobody", null, from("1.1.1.1"))
      .dropIn.submit({ academyId: A, ...VISITOR });

    const mine = await h.as(OWNER, A).dropIn.list();
    expect(mine).toHaveLength(1);
    expect(await rejectionCode(h.as(COACH, A).dropIn.list())).toBe("FORBIDDEN");
  });
});

describe("the rate limit, driven through a real procedure", () => {
  it("lets five walk-ins through from one address, then refuses the sixth", async () => {
    const h = await base();
    const caller = h.as("nobody", null, from("9.9.9.9"));
    const codes: string[] = [];
    for (let i = 0; i < 6; i++) {
      codes.push(
        await rejectionCode(
          caller.dropIn.submit({
            academyId: A,
            ...VISITOR,
            phone: `+35191111111${i}`,
          }),
        ),
      );
    }
    expect(codes.slice(0, 5)).toEqual(Array(5).fill("resolved without error"));
    expect(codes[5]).toBe("TOO_MANY_REQUESTS");
  });

  it("keys on the address, so one flooder cannot lock out the gym", async () => {
    const h = await base();
    const flooder = h.as("nobody", null, from("9.9.9.9"));
    for (let i = 0; i < 6; i++) {
      await rejectionCode(
        flooder.dropIn.submit({
          academyId: A,
          ...VISITOR,
          phone: `+35191111111${i}`,
        }),
      );
    }

    await expect(
      h
        .as("nobody", null, from("8.8.8.8"))
        .dropIn.submit({ academyId: A, ...VISITOR }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("keys on the path too, so one capped route does not cap another", async () => {
    const h = await base();
    const ip = from("7.7.7.7");
    for (let i = 0; i < 6; i++) {
      await rejectionCode(
        h.as("nobody", null, ip).dropIn.submit({
          academyId: A,
          ...VISITOR,
          phone: `+35191111111${i}`,
        }),
      );
    }

    await expect(
      h.as(OWNER, A, ip).academy.findByCode({ code: "100001" }),
    ).resolves.toMatchObject({ academyId: A });
  });
});

describe("invite.resolve, the only other unauthed read", () => {
  it("tells a visitor which gym a live link belongs to", async () => {
    const h = await base();
    const invite = await h.as(OWNER, A).invite.create({ role: "student" });
    await expect(
      h.as("nobody", null).invite.resolve({ token: invite.token }),
    ).resolves.toMatchObject({ academyId: A });
  });

  it("gives nothing away for a token that was never minted", async () => {
    const h = await base();
    expect(
      await rejectionCode(
        h.as("nobody", null).invite.resolve({ token: "not-a-real-token" }),
      ),
    ).toBe("NOT_FOUND");
  });
});
