import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { resetRateLimits } from "../src/rate-limit";
import {
  createTRPCRouter,
  PUBLIC_DEFAULT_MAX,
  publicProcedure,
} from "../src/trpc";
import { harness, rejectionCode, seedAcademies, seedClasses } from "./helpers";

const A = "academy_A";
const OWNER = "u_owner";
const COACH = "u_coach";
const CLASS_FUTURE = "aaaaaaaa-0000-4000-8000-000000000001";

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
  const h = await harness([
    {
      id: A,
      code: "100001",
      members: [
        { userId: OWNER, role: "owner", status: "active" },
        { userId: COACH, role: "instructor", status: "active" },
      ],
    },
  ]);
  open = h;
  return h;
}

async function mintToken(h: Harness): Promise<string> {
  const link = await h.as(OWNER, A).dropIn.link();
  return link.token;
}

describe("dropIn.resolve, the unauthenticated token-to-academy lookup", () => {
  it("returns the academy name and timezone for a valid token", async () => {
    const h = await base();
    const token = await mintToken(h);
    const result = await h.as("nobody", null).dropIn.resolve({ token });
    expect(typeof result.name).toBe("string");
  });

  it("returns NOT_FOUND for an unknown token", async () => {
    const h = await base();
    expect(
      await rejectionCode(
        h.as("nobody", null).dropIn.resolve({ token: "not-a-real-token" }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("returns NOT_FOUND for a rotated token", async () => {
    const h = await base();
    const first = await mintToken(h);
    await h.as(OWNER, A).dropIn.rotateLink();
    expect(
      await rejectionCode(
        h.as("nobody", null).dropIn.resolve({ token: first }),
      ),
    ).toBe("NOT_FOUND");
  });
});

describe("dropIn.classes, the unauthenticated class listing", () => {
  it("returns now and upcoming arrays for a valid token", async () => {
    const h = await base();
    const token = await mintToken(h);
    const result = await h.as("nobody", null).dropIn.classes({ token });
    expect(Array.isArray(result.now)).toBe(true);
    expect(Array.isArray(result.upcoming)).toBe(true);
  });

  it("returns NOT_FOUND for an unknown token", async () => {
    const h = await base();
    expect(
      await rejectionCode(
        h.as("nobody", null).dropIn.classes({ token: "ghost-token" }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("lists a future class in upcoming", async () => {
    const h = await base();
    const token = await mintToken(h);
    await seedClasses(h.pg, [
      {
        id: CLASS_FUTURE,
        academyId: A,
        instructorId: COACH,
        startsInMinutes: 120,
        durationMinutes: 60,
      },
    ]);
    const result = await h.as("nobody", null).dropIn.classes({ token });
    expect(result.upcoming.map((c) => c.id)).toContain(CLASS_FUTURE);
  });
});

describe("dropIn.lookup, the unauthenticated phone+email check", () => {
  it("returns null match when no lead has that phone", async () => {
    const h = await base();
    const token = await mintToken(h);
    const result = await h.as("nobody", null, from("2.2.2.1")).dropIn.lookup({
      token,
      phone: "+351999000111",
      email: "nobody@example.com",
    });
    expect(result.match).toBeNull();
  });

  it("returns a match for a known phone and email", async () => {
    const h = await base();
    const token = await mintToken(h);
    await h.pg.query(
      `INSERT INTO "drop_in" (academy_id, first_name, last_name, phone, email, consent, belt, source)
         VALUES ($1, 'Ana', 'Silva', '+351911111111', 'ana@example.com', true, 'Blue', 'link')`,
      [A],
    );
    const result = await h.as("nobody", null, from("2.2.2.2")).dropIn.lookup({
      token,
      phone: "+351911111111",
      email: "ana@example.com",
    });
    expect(result.match).toMatchObject({ firstName: "Ana" });
  });

  it("returns NOT_FOUND for an unknown token", async () => {
    const h = await base();
    expect(
      await rejectionCode(
        h.as("nobody", null, from("2.2.2.3")).dropIn.lookup({
          token: "no-such-token",
          phone: "+351911111111",
          email: "x@x.com",
        }),
      ),
    ).toBe("NOT_FOUND");
  });
});

describe("dropIn.submit, the token-based visitor booking", () => {
  it("books a new visitor on a future class", async () => {
    const h = await base();
    const token = await mintToken(h);
    await seedClasses(h.pg, [
      {
        id: CLASS_FUTURE,
        academyId: A,
        instructorId: COACH,
        startsInMinutes: 90,
        durationMinutes: 60,
      },
    ]);
    const result = await h.as("nobody", null, from("3.3.3.1")).dropIn.submit({
      kind: "new",
      token,
      phone: "+351911111111",
      email: "ana@example.com",
      firstName: "Ana",
      lastName: "Silva",
      consent: true,
      classId: CLASS_FUTURE,
      belt: "White",
    });
    expect(result).toMatchObject({ mode: "book" });
  });

  it("returns NOT_FOUND for a rotated token", async () => {
    const h = await base();
    const first = await mintToken(h);
    await h.as(OWNER, A).dropIn.rotateLink();
    await seedClasses(h.pg, [
      {
        id: CLASS_FUTURE,
        academyId: A,
        instructorId: COACH,
        startsInMinutes: 90,
        durationMinutes: 60,
      },
    ]);
    expect(
      await rejectionCode(
        h.as("nobody", null, from("3.3.3.2")).dropIn.submit({
          kind: "new",
          token: first,
          phone: "+351911111111",
          email: "ana@example.com",
          firstName: "Ana",
          lastName: "Silva",
          consent: true,
          classId: CLASS_FUTURE,
          belt: "White",
        }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("returns PRECONDITION_FAILED for a class that belongs to another academy", async () => {
    const h = await base();
    const token = await mintToken(h);
    const CLASS_OTHER = "aaaaaaaa-0000-4000-8000-000000000099";
    await seedAcademies(h.pg, [
      { id: "academy_B", code: "100099", members: [] },
    ]);
    await seedClasses(h.pg, [
      {
        id: CLASS_OTHER,
        academyId: "academy_B",
        instructorId: COACH,
        startsInMinutes: 90,
        durationMinutes: 60,
      },
    ]);
    expect(
      await rejectionCode(
        h.as("nobody", null, from("3.3.3.3")).dropIn.submit({
          kind: "new",
          token,
          phone: "+351911111111",
          email: "ana@example.com",
          firstName: "Ana",
          lastName: "Silva",
          consent: true,
          classId: CLASS_OTHER,
          belt: "White",
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });
});

describe("the default cap every public procedure carries", () => {
  const probe = createTRPCRouter({
    session: publicProcedure.query(({ ctx }) => ctx.session),
  });

  it("caps a public procedure that declares no limit of its own", async () => {
    const h = await base();
    const caller = probe.createCaller(
      h.ctxFor("nobody", null, from("6.6.6.6")),
    );
    for (let i = 0; i < PUBLIC_DEFAULT_MAX; i++) {
      await expect(caller.session()).resolves.toMatchObject({
        user: { id: "nobody" },
      });
    }
    expect(await rejectionCode(caller.session())).toBe("TOO_MANY_REQUESTS");
  });

  it("leaves an authed procedure alone", async () => {
    const h = await base();
    const ip = from("5.5.5.5");
    const caller = probe.createCaller(h.ctxFor("nobody", null, ip));
    for (let i = 0; i < PUBLIC_DEFAULT_MAX; i++) {
      await caller.session();
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
