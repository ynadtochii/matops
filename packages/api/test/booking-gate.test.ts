import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { eq } from "@matops/db";
import { accessAssignment, entity } from "@matops/db/schema";

import type { Harness } from "./helpers";
import { harness, memberId, rejectionCode, seedClasses } from "./helpers";

const ACAD = "acad_gate";
const OWNER = "u_gate_owner";
const STUDENT = "u_gate_student";
const PENDING = "u_gate_pending";
const CLASS = "00000000-0000-4000-8000-0000000a0001";

describe("shared membership booking gate", () => {
  let h: Harness;
  let planId: string;

  const owner = () => h.as(OWNER, ACAD);
  const student = () => h.as(STUDENT, ACAD);

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
    h = await harness([
      {
        id: ACAD,
        code: "700040",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
          {
            userId: PENDING,
            role: "member",
            status: "pending",
            invitedRole: "student",
          },
        ],
      },
    ]);
    await seedClasses(h.pg, [
      { id: CLASS, academyId: ACAD, instructorId: OWNER, startsInMinutes: 60 },
    ]);
    await h.pg.query('UPDATE "class" SET starts_at = $1 WHERE id = $2', [
      "2026-09-16T12:00:00Z",
      CLASS,
    ]);
    planId = (
      await owner().accessPlan.create({
        name: "Unlimited",
        entityIds: [ACAD],
        priceMinor: 8000,
        currency: "EUR",
      })
    ).id;
    await owner().accessPlan.setPolicy({
      graceDays: 7,
      calendarTimeZone: "UTC",
      bankDetails: "Test bank",
    });
  });

  afterEach(async () => {
    await h.close();
    vi.useRealTimers();
  });

  const enforce = (on: boolean) =>
    h.exec
      .update(entity)
      .set({ membershipEnforcedAt: on ? new Date() : null })
      .where(eq(entity.id, ACAD));

  const assign = async () => {
    const result = await owner().accessPlan.assign({
      userId: STUDENT,
      planId,
      startMonth: "2026-09-01",
    });
    return result.id;
  };

  const ageAssignment = (id: string) =>
    h.exec
      .update(accessAssignment)
      .set({ startsOn: "2026-09-01" })
      .where(eq(accessAssignment.id, id));

  it("allows booking when enforcement is off", async () => {
    await assign();
    expect((await student().booking.book({ classId: CLASS })).tier).toBe(
      "confirmed",
    );
  });

  it("allows an unpaid assignment during its grace period", async () => {
    await enforce(true);
    await assign();
    expect((await student().booking.book({ classId: CLASS })).tier).toBe(
      "confirmed",
    );
  });

  it("locks an unpaid assignment after grace", async () => {
    await enforce(true);
    const assignmentId = await assign();
    await ageAssignment(assignmentId);
    expect(
      await rejectionCode(student().booking.book({ classId: CLASS })),
    ).toBe("PRECONDITION_FAILED");
  });

  it("allows provisional booking while staff checks a payment claim", async () => {
    await enforce(true);
    const assignmentId = await assign();
    await ageAssignment(assignmentId);
    await student().accessPlan.claimMonth({ assignmentId });
    expect((await student().booking.book({ classId: CLASS })).tier).toBe(
      "provisional",
    );
    await owner().accessPlan.markMonth({
      assignmentId,
      month: "2026-09-01",
      paid: true,
    });
    expect((await student().booking.book({ classId: CLASS })).tier).toBe(
      "confirmed",
    );
  });

  it("lets a locked member cancel an existing booking", async () => {
    const assignmentId = await assign();
    await owner().accessPlan.markMonth({
      assignmentId,
      month: "2026-09-01",
      paid: true,
    });
    await enforce(true);
    await student().booking.book({ classId: CLASS });
    await owner().accessPlan.markMonth({
      assignmentId,
      month: "2026-09-01",
      paid: false,
    });
    await ageAssignment(assignmentId);
    expect((await student().booking.cancel({ classId: CLASS })).ok).toBe(true);
  });

  it("never gates active staff", async () => {
    await enforce(true);
    expect((await owner().booking.book({ classId: CLASS })).tier).toBe(
      "confirmed",
    );
  });

  it("keeps pending members blocked", async () => {
    await enforce(true);
    expect(
      await rejectionCode(h.as(PENDING, ACAD).booking.book({ classId: CLASS })),
    ).toBe("FORBIDDEN");
    expect((await h.as(PENDING, ACAD).booking.access()).locked).toBe(true);
  });

  it("shows shared membership standing on the roster", async () => {
    await enforce(true);
    const assignmentId = await assign();
    await owner().accessPlan.markMonth({
      assignmentId,
      month: "2026-09-01",
      paid: true,
    });
    const rows = await owner().membership.members();
    const row = rows.find(
      (member) => member.memberId === memberId(ACAD, STUDENT),
    );
    expect(row?.membership).toMatchObject({
      verdict: "ok",
      accessSource: "membership",
      covered: true,
      planNames: ["Unlimited"],
    });
  });
});
