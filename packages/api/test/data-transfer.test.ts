import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { and, eq } from "@matops/db";
import {
  accessPlan,
  classInstance,
  classParticipation,
  membershipMonth,
  membershipMonthAudit,
  person,
} from "@matops/db/schema";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedAcademies } from "./helpers";

const GYM = "acad_transfer";
const OTHER = "acad_transfer_other";
const OWNER = "u_transfer_owner";
const MANAGER = "u_transfer_manager";
const STUDENT = "u_transfer_student";

const columns = {
  name: "name",
  email: "email",
  phone: "phone",
  branch: "branch",
  plan: "plan",
  startMonth: "start_month",
  paymentMonth: "payment_month",
  paymentStatus: "payment_status",
};

describe("data transfer", () => {
  let h: Harness;
  let planId: string;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: GYM,
        code: "803001",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: MANAGER, role: "manager", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
        ],
      },
      {
        id: OTHER,
        code: "803002",
        members: [],
      },
    ]);
    const [plan] = await h.exec
      .insert(accessPlan)
      .values({ organizationId: GYM, name: "Unlimited" })
      .returning({ id: accessPlan.id });
    if (!plan) throw new Error("Expected a membership plan");
    planId = plan.id;
  });

  afterAll(() => h.close());

  it("previews without writes and commits an accountless paid student", async () => {
    const input = {
      csv: "name,email\nImported Student,imported@test.local\n",
      columns,
      defaults: {
        entityId: GYM,
        planId,
        paymentStatus: "paid" as const,
      },
    };
    const preview = await h
      .as(MANAGER, GYM)
      .dataTransfer.previewStudentImport(input);
    expect(preview.summary).toEqual({
      total: 1,
      ready: 1,
      needsDecision: 0,
      rejected: 0,
    });
    expect(
      await h.exec
        .select()
        .from(person)
        .where(eq(person.email, "imported@test.local")),
    ).toHaveLength(0);
    const result = await h.as(MANAGER, GYM).dataTransfer.commitStudentImport({
      ...input,
      previewHash: preview.previewHash,
      excludedRows: [],
      decisions: [],
    });
    const imported = result.imported[0];
    if (!imported?.assignmentId) throw new Error("Expected an assignment");
    expect(imported.createdPerson).toBe(true);
    const [month] = await h.exec
      .select()
      .from(membershipMonth)
      .where(eq(membershipMonth.assignmentId, imported.assignmentId));
    expect(month?.status).toBe("confirmed");
    const [audit] = await h.exec
      .select()
      .from(membershipMonthAudit)
      .where(eq(membershipMonthAudit.assignmentId, imported.assignmentId));
    expect(audit).toEqual(
      expect.objectContaining({
        event: "imported",
        beforeStatus: null,
        afterStatus: "confirmed",
        actorId: MANAGER,
      }),
    );
    const classId = "19fca10f-4dd6-4f3d-b907-915d6552637a";
    await h.exec.insert(classInstance).values({
      id: classId,
      academyId: GYM,
      title: "Imported attendance",
      startsAt: new Date("2026-08-10T18:00:00Z"),
      durationMinutes: 60,
      capacity: 20,
    });
    await h.exec.insert(classParticipation).values({
      academyId: GYM,
      classId,
      personOrganizationId: GYM,
      personId: imported.personId,
      bookingStatus: "none",
      bookingTier: "confirmed",
      attendanceStatus: "present",
      attendedAt: new Date("2026-08-10T18:00:00Z"),
    });
    const started = await h.as(MANAGER, GYM).dataTransfer.startExport({});
    const paymentHistory = await h.as(MANAGER, GYM).dataTransfer.exportPage({
      dataset: "payment_history",
      exportedAt: started.exportedAt.toISOString(),
      limit: 500,
    });
    expect(paymentHistory.rows).toContainEqual(
      expect.arrayContaining([imported.assignmentId, imported.personId]),
    );
    const attendance = await h.as(MANAGER, GYM).dataTransfer.exportPage({
      dataset: "attendance",
      exportedAt: started.exportedAt.toISOString(),
      limit: 500,
    });
    expect(attendance.rows).toContainEqual(
      expect.arrayContaining([imported.personId, "Imported attendance"]),
    );
  });

  it("requires duplicate decisions and rolls back earlier rows", async () => {
    await h.as(OWNER, GYM).person.createStudent({
      entityId: GYM,
      name: "Existing Student",
    });
    const input = {
      csv: "name\nUnique Before Failure\nExisting Student\n",
      columns,
      defaults: { entityId: GYM },
    };
    const preview = await h
      .as(OWNER, GYM)
      .dataTransfer.previewStudentImport(input);
    expect(preview.summary.needsDecision).toBe(1);
    expect(
      await rejectionCode(
        h.as(OWNER, GYM).dataTransfer.commitStudentImport({
          ...input,
          previewHash: preview.previewHash,
          excludedRows: [],
          decisions: [],
        }),
      ),
    ).toBe("CONFLICT");
    expect(
      await h.exec
        .select()
        .from(person)
        .where(
          and(
            eq(person.organizationId, GYM),
            eq(person.name, "Unique Before Failure"),
          ),
        ),
    ).toHaveLength(0);
  });

  it("rejects matching rows in one upload and foreign branches", async () => {
    const repeated = await h.as(OWNER, GYM).dataTransfer.previewStudentImport({
      csv: "name\nSame Student\nSame Student\n",
      columns,
      defaults: { entityId: GYM },
    });
    expect(repeated.summary.rejected).toBe(2);
    const foreign = await h.as(OWNER, GYM).dataTransfer.previewStudentImport({
      csv: "name\nForeign Student\n",
      columns,
      defaults: { entityId: OTHER },
    });
    expect(foreign.rows[0]?.errors).toContainEqual(
      expect.objectContaining({ field: "branch" }),
    );
  });

  it("exports archived people without using screen filters", async () => {
    const created = await h.as(OWNER, GYM).person.createStudent({
      entityId: GYM,
      name: "Archived Export",
    });
    await h.as(OWNER, GYM).person.archive({ personId: created.personId });
    const started = await h.as(OWNER, GYM).dataTransfer.startExport({});
    const page = await h.as(OWNER, GYM).dataTransfer.exportPage({
      dataset: "people",
      exportedAt: started.exportedAt.toISOString(),
      limit: 500,
    });
    expect(page.rows).toContainEqual(
      expect.arrayContaining([created.personId, "Archived Export"]),
    );
  });

  it("does not let a student import or export", async () => {
    expect(
      await rejectionCode(
        h.as(STUDENT, GYM).dataTransfer.previewStudentImport({
          csv: "name\nNo Access\n",
          columns,
          defaults: { entityId: GYM },
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await rejectionCode(h.as(STUDENT, GYM).dataTransfer.startExport({})),
    ).toBe("FORBIDDEN");
  });
});
