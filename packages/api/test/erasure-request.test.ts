import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, memberId, rejectionCode } from "./helpers";

const ACAD = "acad_erase_req";

const OWNER = "u_erase_owner";
const MANAGER = "u_erase_manager";
const COACH = "u_erase_coach";
const STUDENT = "u_erase_student";
const APPLICANT = "u_erase_applicant";

const STUDENT_MEMBER = memberId(ACAD, STUDENT);

const requestedAt = async (h: Harness, id: string) => {
  const res = await h.pg.query<{ at: Date | null }>(
    `SELECT erasure_requested_at AS at FROM "entity_membership" WHERE id = $1`,
    [id],
  );
  return res.rows[0]?.at ?? null;
};

describe("erase requests (ADR 145)", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await harness([
      {
        id: ACAD,
        code: "700245",
        members: [
          { userId: OWNER, role: "owner", status: "active", name: "Owner" },
          {
            userId: MANAGER,
            role: "manager",
            status: "active",
            name: "Manager",
          },
          {
            userId: COACH,
            role: "instructor",
            status: "active",
            name: "Coach",
          },
          {
            userId: STUDENT,
            role: "student",
            status: "active",
            name: "Student",
          },
          {
            userId: APPLICANT,
            role: "student",
            status: "pending",
            name: "Applicant",
          },
        ],
      },
    ]);
  });

  afterEach(async () => {
    await h.close();
  });

  it("records the request and shows it on the roster", async () => {
    await h.as(STUDENT, ACAD).membership.requestErasure();

    expect(await requestedAt(h, STUDENT_MEMBER)).not.toBeNull();
    const mine = await h.as(STUDENT, ACAD).membership.erasureRequest();
    expect(mine.requestedAt).not.toBeNull();
    const roster = await h.as(OWNER, ACAD).membership.members();
    const row = roster.find((r) => r.memberId === STUDENT_MEMBER);
    expect(row?.erasureRequestedAt).not.toBeNull();
  });

  it("keeps the first date when asked twice", async () => {
    await h.as(STUDENT, ACAD).membership.requestErasure();
    const first = await requestedAt(h, STUDENT_MEMBER);
    await h.as(STUDENT, ACAD).membership.requestErasure();
    expect(await requestedAt(h, STUDENT_MEMBER)).toEqual(first);
  });

  it("clears the request on withdraw", async () => {
    await h.as(STUDENT, ACAD).membership.requestErasure();
    await h.as(STUDENT, ACAD).membership.withdrawErasureRequest();
    expect(await requestedAt(h, STUDENT_MEMBER)).toBeNull();
  });

  it("lets a pending applicant ask", async () => {
    await h.as(APPLICANT, ACAD).membership.requestErasure();
    expect(await requestedAt(h, memberId(ACAD, APPLICANT))).not.toBeNull();
  });

  it("refuses staff", async () => {
    expect(
      await rejectionCode(h.as(OWNER, ACAD).membership.requestErasure()),
    ).toBe("PRECONDITION_FAILED");
    expect(
      await rejectionCode(h.as(COACH, ACAD).membership.requestErasure()),
    ).toBe("PRECONDITION_FAILED");
  });

  it("does not delete anything by itself", async () => {
    await h.as(STUDENT, ACAD).membership.requestErasure();
    const res = await h.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "user" WHERE id = $1`,
      [STUDENT],
    );
    expect(res.rows[0]?.n).toBe(1);
  });

  it("lets a manager erase the student who asked", async () => {
    await h.as(STUDENT, ACAD).membership.requestErasure();
    await h.as(MANAGER, ACAD).membership.purge({ memberId: STUDENT_MEMBER });
    const res = await h.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "entity_membership" WHERE id = $1`,
      [STUDENT_MEMBER],
    );
    expect(res.rows[0]?.n).toBe(0);
  });

  it("does not let a manager erase an owner", async () => {
    expect(
      await rejectionCode(
        h
          .as(MANAGER, ACAD)
          .membership.purge({ memberId: memberId(ACAD, OWNER) }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("still refuses a coach", async () => {
    expect(
      await rejectionCode(
        h.as(COACH, ACAD).membership.purge({ memberId: STUDENT_MEMBER }),
      ),
    ).toBe("FORBIDDEN");
  });
});
