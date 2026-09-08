import { createHash } from "node:crypto";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { DbReader, PersonDuplicate } from "@matops/db";
import {
  and,
  asc,
  eq,
  findPersonDuplicates,
  gt,
  isNull,
  lte,
  sql,
} from "@matops/db";
import {
  accessAssignment,
  accessPlan,
  attendanceCorrection,
  classInstance,
  classParticipation,
  entity,
  entityMembership,
  membershipMonth,
  membershipMonthAudit,
  membershipPolicy,
  person,
} from "@matops/db/schema";
import { monthOf, parseCsv, resolveAcademyTimeZone } from "@matops/domain";
import {
  OrganizationExportPageSchema,
  OrganizationExportStartSchema,
  PreviewCreatePersonSchema,
  StudentImportCommitSchema,
  StudentImportPreviewSchema,
} from "@matops/validators";

import { organizationManagerIdentityProcedure } from "../trpc";
import { assignOne } from "./accessPlan";
import { enrollStudent } from "./person";

type PreviewInput = typeof StudentImportPreviewSchema._output;
interface PreviewRow {
  rowNumber: number;
  source: Record<string, string>;
  normalized: {
    name: string;
    email: string | null;
    phone: string | null;
    entityId: string;
    entityName: string;
    planId: string | null;
    planName: string | null;
    startMonth: string | null;
    paymentMonth: string | null;
    paymentStatus: "paid" | "unpaid" | null;
  } | null;
  state: "ready" | "needs_decision" | "rejected";
  duplicates: PersonDuplicate[];
  errors: { field: string; message: string }[];
}

const datasets = [
  "people",
  "enrollments",
  "memberships",
  "membership_months",
  "payment_history",
  "attendance",
  "attendance_corrections",
] as const;

const exportHeaders: Record<(typeof datasets)[number], string[]> = {
  people: [
    "person_id",
    "name",
    "email",
    "phone",
    "account_user_id",
    "archived_at",
    "created_at",
    "updated_at",
  ],
  enrollments: [
    "enrollment_id",
    "person_id",
    "branch_id",
    "branch_name",
    "role",
    "status",
    "invited_role",
    "joined_at",
    "created_at",
    "updated_at",
  ],
  memberships: [
    "assignment_id",
    "person_id",
    "plan_id",
    "plan_name",
    "status",
    "start_month",
    "end_month",
    "assigning_branch_id",
    "assigned_by_account_user_id",
    "created_at",
    "updated_at",
  ],
  membership_months: [
    "month_record_id",
    "assignment_id",
    "person_id",
    "month",
    "status",
    "version",
    "claimed_by_account_user_id",
    "reported_at",
    "reviewed_by_account_user_id",
    "reviewed_at",
    "price_minor",
    "currency",
    "deadline",
    "calendar_time_zone",
    "created_at",
    "updated_at",
  ],
  payment_history: [
    "payment_event_id",
    "assignment_id",
    "person_id",
    "month",
    "event",
    "before_status",
    "after_status",
    "reason",
    "price_minor",
    "currency",
    "deadline",
    "calendar_time_zone",
    "actor_account_user_id",
    "created_at",
  ],
  attendance: [
    "participation_id",
    "person_id",
    "branch_id",
    "branch_name",
    "class_id",
    "class_title",
    "class_starts_at",
    "booking_status",
    "booking_tier",
    "booked_at",
    "cancelled_at",
    "attendance_status",
    "attended_at",
    "marked_by_account_user_id",
    "created_at",
    "updated_at",
  ],
  attendance_corrections: [
    "correction_id",
    "branch_id",
    "branch_name",
    "class_id",
    "kind",
    "subject_id",
    "before_value",
    "after_value",
    "reason",
    "actor_account_user_id",
    "created_at",
  ],
};

function valueAt(
  row: string[],
  headerIndex: Map<string, number>,
  header: string | undefined,
) {
  if (!header) return "";
  const index = headerIndex.get(header.trim().toLowerCase());
  return index === undefined ? "" : (row[index] ?? "").trim();
}

function resolveNamed<T extends { id: string; name: string }>(
  rows: T[],
  value: string,
) {
  const needle = value.trim().toLowerCase();
  return rows.filter(
    (row) =>
      row.id.toLowerCase() === needle || row.name.toLowerCase() === needle,
  );
}

function month(value: string) {
  if (!/^\d{4}-\d{2}(-01)?$/.test(value)) return null;
  return `${value.slice(0, 7)}-01`;
}

function firstValue(...values: (string | null | undefined)[]) {
  return (
    values.find(
      (value) => value !== undefined && value !== null && value !== "",
    ) ?? ""
  );
}

function previewHash(rows: PreviewRow[]) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        rows.map((row) => ({
          rowNumber: row.rowNumber,
          normalized: row.normalized,
          state: row.state,
          duplicates: row.duplicates.map((match) => match.personId).sort(),
          errors: row.errors,
        })),
      ),
    )
    .digest("hex");
}

async function buildPreview(
  db: DbReader,
  organizationId: string,
  input: PreviewInput,
): Promise<{
  previewHash: string;
  summary: {
    total: number;
    ready: number;
    needsDecision: number;
    rejected: number;
  };
  rows: PreviewRow[];
}> {
  let parsed: string[][];
  try {
    parsed = parseCsv(input.csv);
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        error instanceof Error ? error.message : "Could not read the CSV",
    });
  }
  if (parsed.length < 2) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Add a header and at least one student",
    });
  }
  if (parsed.length > 501) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Import at most 500 students at once",
    });
  }
  const headers = parsed[0] ?? [];
  const lowered = headers.map((header) => header.trim().toLowerCase());
  if (new Set(lowered).size !== lowered.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "CSV headers must be unique",
    });
  }
  const headerIndex = new Map(lowered.map((header, index) => [header, index]));
  if (!headerIndex.has(input.columns.name.trim().toLowerCase())) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The name column was not found",
    });
  }

  const branches = await db
    .select({
      id: entity.id,
      name: entity.name,
      timeZone: entity.timeZone,
      isDefault: entity.isDefault,
    })
    .from(entity)
    .where(
      and(
        eq(entity.organizationId, organizationId),
        eq(entity.status, "active"),
        isNull(entity.deletedAt),
      ),
    );
  const plans = await db
    .select({
      id: accessPlan.id,
      name: accessPlan.name,
      archivedAt: accessPlan.archivedAt,
    })
    .from(accessPlan)
    .where(eq(accessPlan.organizationId, organizationId));
  const [policy] = await db
    .select({ calendarTimeZone: membershipPolicy.calendarTimeZone })
    .from(membershipPolicy)
    .where(eq(membershipPolicy.organizationId, organizationId))
    .limit(1);
  const home =
    branches.find((branch) => branch.isDefault) ?? branches.at(0) ?? null;
  const currentMonth = monthOf(
    new Date(),
    resolveAcademyTimeZone(policy?.calendarTimeZone ?? home?.timeZone),
  );

  const rows: PreviewRow[] = await Promise.all(
    parsed.slice(1).map(async (source, index) => {
      const rowNumber = index + 2;
      const raw = Object.fromEntries(
        headers.map((header, cell) => [header, source[cell] ?? ""]),
      );
      const rawName = valueAt(source, headerIndex, input.columns.name);
      const rawEmail = valueAt(source, headerIndex, input.columns.email);
      const rawPhone = valueAt(source, headerIndex, input.columns.phone);
      const contact = PreviewCreatePersonSchema.safeParse({
        name: rawName,
        email: rawEmail === "" ? undefined : rawEmail,
        phone: rawPhone === "" ? undefined : rawPhone,
      });
      const errors: { field: string; message: string }[] = [];
      if (!contact.success) {
        for (const issue of contact.error.issues) {
          errors.push({
            field: String(issue.path[0] ?? "row"),
            message: issue.message,
          });
        }
      }

      const branchValue = firstValue(
        valueAt(source, headerIndex, input.columns.branch),
        input.defaults.entityId,
      );
      const branchMatches = resolveNamed(branches, branchValue);
      const branch = branchMatches.length === 1 ? branchMatches[0] : undefined;
      if (branchMatches.length !== 1) {
        errors.push({
          field: "branch",
          message: branchMatches.length
            ? "Branch is ambiguous"
            : "Branch was not found",
        });
      }
      const planValue = firstValue(
        valueAt(source, headerIndex, input.columns.plan),
        input.defaults.planId,
      );
      const planMatches = planValue ? resolveNamed(plans, planValue) : [];
      if (planValue && planMatches.length !== 1) {
        errors.push({
          field: "plan",
          message: planMatches.length
            ? "Membership is ambiguous"
            : "Membership was not found",
        });
      }
      if (planMatches[0]?.archivedAt) {
        errors.push({ field: "plan", message: "Membership is archived" });
      }
      const startValue = firstValue(
        valueAt(source, headerIndex, input.columns.startMonth),
        input.defaults.startMonth,
      );
      const startMonth = startValue ? month(startValue) : null;
      if (startValue && !startMonth)
        errors.push({
          field: "startMonth",
          message: "Use YYYY-MM or YYYY-MM-01",
        });
      const paymentValue = firstValue(
        valueAt(source, headerIndex, input.columns.paymentMonth),
        input.defaults.paymentMonth,
        startMonth,
      );
      let paymentMonth = paymentValue ? month(paymentValue) : null;
      if (paymentValue && !paymentMonth)
        errors.push({
          field: "paymentMonth",
          message: "Use YYYY-MM or YYYY-MM-01",
        });
      const paymentStatusValue = firstValue(
        valueAt(source, headerIndex, input.columns.paymentStatus),
        input.defaults.paymentStatus,
      ).toLowerCase();
      const paymentStatus: "paid" | "unpaid" | null =
        paymentStatusValue === "paid" || paymentStatusValue === "unpaid"
          ? paymentStatusValue
          : null;
      if (paymentStatus && !paymentValue) paymentMonth = currentMonth;
      if (paymentStatusValue && !paymentStatus) {
        errors.push({ field: "paymentStatus", message: "Use paid or unpaid" });
      }
      if (paymentStatus && planMatches.length !== 1) {
        errors.push({
          field: "paymentStatus",
          message: "Choose a membership first",
        });
      }

      const normalized =
        contact.success && branch && (!planValue || planMatches.length === 1)
          ? {
              ...contact.data,
              email: contact.data.email ?? null,
              phone: contact.data.phone ?? null,
              entityId: branch.id,
              entityName: branch.name,
              planId: planMatches[0]?.id ?? null,
              planName: planMatches[0]?.name ?? null,
              startMonth,
              paymentMonth,
              paymentStatus,
            }
          : null;
      const duplicates = normalized
        ? await findPersonDuplicates(db, { organizationId, ...normalized })
        : [];
      return {
        rowNumber,
        source: raw,
        normalized,
        state:
          errors.length > 0
            ? ("rejected" as const)
            : duplicates.length > 0
              ? ("needs_decision" as const)
              : ("ready" as const),
        duplicates: duplicates.sort((left, right) =>
          left.personId.localeCompare(right.personId),
        ),
        errors,
      };
    }),
  );

  const keys = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.normalized) continue;
    const values = [
      `name:${row.normalized.name.trim().toLowerCase()}`,
      row.normalized.email
        ? `email:${row.normalized.email.toLowerCase()}`
        : null,
      row.normalized.phone ? `phone:${row.normalized.phone}` : null,
    ].filter((value): value is string => value !== null);
    for (const value of values)
      keys.set(value, [...(keys.get(value) ?? []), row.rowNumber]);
  }
  for (const row of rows) {
    if (!row.normalized) continue;
    const repeated = [...keys.values()].some(
      (rowNumbers) =>
        rowNumbers.length > 1 && rowNumbers.includes(row.rowNumber),
    );
    if (repeated) {
      row.errors.push({
        field: "row",
        message: "Another uploaded row matches this person",
      });
      row.state = "rejected";
    }
  }

  return {
    previewHash: previewHash(rows),
    summary: {
      total: rows.length,
      ready: rows.filter((row) => row.state === "ready").length,
      needsDecision: rows.filter((row) => row.state === "needs_decision")
        .length,
      rejected: rows.filter((row) => row.state === "rejected").length,
    },
    rows,
  };
}

function idsEqual(left: string[], right: string[]) {
  return [...left].sort().join("|") === [...right].sort().join("|");
}

async function exportRows(
  db: DbReader,
  organizationId: string,
  input: typeof OrganizationExportPageSchema._output,
) {
  const asOf = new Date(input.exportedAt);
  const limit = input.limit + 1;
  switch (input.dataset) {
    case "people":
      return db
        .select({
          id: person.id,
          name: person.name,
          email: person.email,
          phone: person.phone,
          accountUserId: person.accountUserId,
          archivedAt: person.archivedAt,
          createdAt: person.createdAt,
          updatedAt: person.updatedAt,
        })
        .from(person)
        .where(
          and(
            eq(person.organizationId, organizationId),
            lte(person.createdAt, asOf),
            input.cursor ? gt(person.id, input.cursor) : undefined,
          ),
        )
        .orderBy(asc(person.id))
        .limit(limit);
    case "enrollments":
      return db
        .select({
          id: entityMembership.id,
          personId: sql<string>`coalesce(${entityMembership.personId}::text, ${entityMembership.userId})`,
          branchId: entityMembership.entityId,
          branchName: entity.name,
          role: entityMembership.role,
          status: entityMembership.status,
          invitedRole: entityMembership.invitedRole,
          joinedAt: entityMembership.joinedAt,
          createdAt: entityMembership.createdAt,
          updatedAt: entityMembership.updatedAt,
        })
        .from(entityMembership)
        .innerJoin(entity, eq(entity.id, entityMembership.entityId))
        .where(
          and(
            eq(entityMembership.organizationId, organizationId),
            lte(entityMembership.createdAt, asOf),
            input.cursor ? gt(entityMembership.id, input.cursor) : undefined,
          ),
        )
        .orderBy(asc(entityMembership.id))
        .limit(limit);
    case "memberships":
      return db
        .select({
          id: accessAssignment.id,
          personId: accessAssignment.personId,
          planId: accessAssignment.planId,
          planName: accessPlan.name,
          status: accessAssignment.status,
          startMonth: accessAssignment.startMonth,
          endMonth: accessAssignment.endMonth,
          assigningEntityId: accessAssignment.assigningEntityId,
          assignedBy: accessAssignment.assignedBy,
          createdAt: accessAssignment.createdAt,
          updatedAt: accessAssignment.updatedAt,
        })
        .from(accessAssignment)
        .innerJoin(accessPlan, eq(accessPlan.id, accessAssignment.planId))
        .where(
          and(
            eq(accessAssignment.organizationId, organizationId),
            lte(accessAssignment.createdAt, asOf),
            input.cursor ? gt(accessAssignment.id, input.cursor) : undefined,
          ),
        )
        .orderBy(asc(accessAssignment.id))
        .limit(limit);
    case "membership_months":
      return db
        .select({
          id: membershipMonth.id,
          assignmentId: membershipMonth.assignmentId,
          personId: accessAssignment.personId,
          month: membershipMonth.month,
          status: membershipMonth.status,
          version: membershipMonth.version,
          claimedBy: membershipMonth.claimedBy,
          reportedAt: membershipMonth.reportedAt,
          reviewedBy: membershipMonth.reviewedBy,
          reviewedAt: membershipMonth.reviewedAt,
          priceMinor: membershipMonth.priceMinor,
          currency: membershipMonth.currency,
          deadline: membershipMonth.deadline,
          calendarTimeZone: membershipMonth.calendarTimeZone,
          createdAt: membershipMonth.createdAt,
          updatedAt: membershipMonth.updatedAt,
        })
        .from(membershipMonth)
        .innerJoin(
          accessAssignment,
          eq(accessAssignment.id, membershipMonth.assignmentId),
        )
        .where(
          and(
            eq(membershipMonth.organizationId, organizationId),
            lte(membershipMonth.createdAt, asOf),
            input.cursor ? gt(membershipMonth.id, input.cursor) : undefined,
          ),
        )
        .orderBy(asc(membershipMonth.id))
        .limit(limit);
    case "payment_history":
      return db
        .select({
          id: membershipMonthAudit.id,
          assignmentId: membershipMonthAudit.assignmentId,
          personId: accessAssignment.personId,
          month: membershipMonthAudit.month,
          event: membershipMonthAudit.event,
          beforeStatus: membershipMonthAudit.beforeStatus,
          afterStatus: membershipMonthAudit.afterStatus,
          reason: membershipMonthAudit.reason,
          priceMinor: membershipMonthAudit.priceMinor,
          currency: membershipMonthAudit.currency,
          deadline: membershipMonthAudit.deadline,
          calendarTimeZone: membershipMonthAudit.calendarTimeZone,
          actorId: membershipMonthAudit.actorId,
          createdAt: membershipMonthAudit.createdAt,
        })
        .from(membershipMonthAudit)
        .leftJoin(
          accessAssignment,
          eq(accessAssignment.id, membershipMonthAudit.assignmentId),
        )
        .where(
          and(
            eq(membershipMonthAudit.organizationId, organizationId),
            lte(membershipMonthAudit.createdAt, asOf),
            input.cursor
              ? gt(membershipMonthAudit.id, input.cursor)
              : undefined,
          ),
        )
        .orderBy(asc(membershipMonthAudit.id))
        .limit(limit);
    case "attendance":
      return db
        .select({
          id: classParticipation.id,
          personId: sql<string>`coalesce(${classParticipation.personId}::text, ${classParticipation.studentId})`,
          branchId: classParticipation.academyId,
          branchName: entity.name,
          classId: classParticipation.classId,
          classTitle: classInstance.title,
          classStartsAt: classInstance.startsAt,
          bookingStatus: classParticipation.bookingStatus,
          bookingTier: classParticipation.bookingTier,
          bookedAt: classParticipation.bookedAt,
          cancelledAt: classParticipation.cancelledAt,
          attendanceStatus: classParticipation.attendanceStatus,
          attendedAt: classParticipation.attendedAt,
          markedBy: classParticipation.markedBy,
          createdAt: classParticipation.createdAt,
          updatedAt: classParticipation.updatedAt,
        })
        .from(classParticipation)
        .innerJoin(entity, eq(entity.id, classParticipation.academyId))
        .innerJoin(
          classInstance,
          eq(classInstance.id, classParticipation.classId),
        )
        .where(
          and(
            eq(entity.organizationId, organizationId),
            lte(classParticipation.createdAt, asOf),
            input.cursor ? gt(classParticipation.id, input.cursor) : undefined,
          ),
        )
        .orderBy(asc(classParticipation.id))
        .limit(limit);
    case "attendance_corrections":
      return db
        .select({
          id: attendanceCorrection.id,
          branchId: attendanceCorrection.academyId,
          branchName: entity.name,
          classId: attendanceCorrection.classId,
          kind: attendanceCorrection.kind,
          subjectId: attendanceCorrection.subjectId,
          beforeValue: attendanceCorrection.beforeValue,
          afterValue: attendanceCorrection.afterValue,
          reason: attendanceCorrection.reason,
          actorId: attendanceCorrection.actorId,
          createdAt: attendanceCorrection.createdAt,
        })
        .from(attendanceCorrection)
        .innerJoin(entity, eq(entity.id, attendanceCorrection.academyId))
        .where(
          and(
            eq(entity.organizationId, organizationId),
            lte(attendanceCorrection.createdAt, asOf),
            input.cursor
              ? gt(attendanceCorrection.id, input.cursor)
              : undefined,
          ),
        )
        .orderBy(asc(attendanceCorrection.id))
        .limit(limit);
  }
}

export const dataTransferRouter = {
  previewStudentImport: organizationManagerIdentityProcedure
    .input(StudentImportPreviewSchema)
    .query(({ ctx, input }) =>
      buildPreview(ctx.baseDb, ctx.organizationId, input),
    ),

  commitStudentImport: organizationManagerIdentityProcedure
    .input(StudentImportCommitSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.baseDb.transaction(async (db) => {
        const preview = await buildPreview(db, ctx.organizationId, input);
        if (preview.previewHash !== input.previewHash) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "The preview changed. Review it again.",
          });
        }
        const excluded = new Set(input.excludedRows);
        const decisions = new Map(
          input.decisions.map((decision) => [decision.rowNumber, decision]),
        );
        const imported = [];
        const skipped = preview.rows
          .filter(
            (row) => row.state === "rejected" || excluded.has(row.rowNumber),
          )
          .map((row) => ({
            rowNumber: row.rowNumber,
            reasons: row.errors.map((error) => error.message),
          }));

        for (const row of preview.rows) {
          if (
            !row.normalized ||
            row.state === "rejected" ||
            excluded.has(row.rowNumber)
          )
            continue;
          const decision = decisions.get(row.rowNumber);
          let personId: string;
          let createdPerson = false;
          if (row.duplicates.length > 0) {
            if (!decision)
              throw new TRPCError({
                code: "CONFLICT",
                message: `Row ${row.rowNumber} needs a duplicate decision`,
              });
            if (decision.kind === "use_existing") {
              const match = row.duplicates.find(
                (candidate) => candidate.personId === decision.personId,
              );
              if (!match || match.archivedAt)
                throw new TRPCError({
                  code: "CONFLICT",
                  message: `Row ${row.rowNumber} has an invalid duplicate decision`,
                });
              personId = match.personId;
            } else {
              if (
                !idsEqual(
                  row.duplicates.map((match) => match.personId),
                  decision.reviewedPersonIds,
                )
              ) {
                throw new TRPCError({
                  code: "CONFLICT",
                  message: `Row ${row.rowNumber} duplicate matches changed`,
                });
              }
              const [created] = await db
                .insert(person)
                .values({
                  organizationId: ctx.organizationId,
                  name: row.normalized.name,
                  email: row.normalized.email,
                  phone: row.normalized.phone,
                })
                .returning({ id: person.id });
              if (!created)
                throw new TRPCError({
                  code: "INTERNAL_SERVER_ERROR",
                  message: `Could not import row ${row.rowNumber}`,
                });
              personId = created.id;
              createdPerson = true;
            }
          } else {
            const [created] = await db
              .insert(person)
              .values({
                organizationId: ctx.organizationId,
                name: row.normalized.name,
                email: row.normalized.email,
                phone: row.normalized.phone,
              })
              .returning({ id: person.id });
            if (!created)
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: `Could not import row ${row.rowNumber}`,
              });
            personId = created.id;
            createdPerson = true;
          }
          const enrollment = await enrollStudent(db, {
            organizationId: ctx.organizationId,
            entityId: row.normalized.entityId,
            personId,
          });
          const assignment = row.normalized.planId
            ? await assignOne(
                {
                  db,
                  organizationId: ctx.organizationId,
                  session: { user: { id: ctx.session.user.id } },
                },
                {
                  userId: personId,
                  planId: row.normalized.planId,
                  assigningEntityId: row.normalized.entityId,
                  startMonth: row.normalized.startMonth,
                },
              )
            : null;
          let paymentRecorded = false;
          if (assignment && row.normalized.paymentStatus === "paid") {
            const paymentMonth =
              row.normalized.paymentMonth ?? row.normalized.startMonth;
            if (!paymentMonth)
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Row ${row.rowNumber} needs a payment month`,
              });
            const [saved] = await db
              .insert(membershipMonth)
              .values({
                organizationId: ctx.organizationId,
                assignmentId: assignment.id,
                month: paymentMonth,
                status: "confirmed",
                version: 1,
                reviewedBy: ctx.session.user.id,
                reviewedAt: new Date(),
              })
              .onConflictDoNothing({
                target: [membershipMonth.assignmentId, membershipMonth.month],
              })
              .returning({ id: membershipMonth.id });
            if (!saved)
              throw new TRPCError({
                code: "CONFLICT",
                message: `Row ${row.rowNumber} already has payment history for that month`,
              });
            await db.insert(membershipMonthAudit).values({
              organizationId: ctx.organizationId,
              assignmentId: assignment.id,
              month: paymentMonth,
              event: "imported",
              beforeStatus: null,
              afterStatus: "confirmed",
              actorId: ctx.session.user.id,
            });
            paymentRecorded = true;
          }
          imported.push({
            rowNumber: row.rowNumber,
            personId,
            createdPerson,
            enrollmentId: enrollment.enrollmentId,
            assignmentId: assignment?.id ?? null,
            paymentRecorded,
          });
        }
        return { imported, skipped };
      }),
    ),

  startExport: organizationManagerIdentityProcedure
    .input(OrganizationExportStartSchema)
    .query(() => ({
      exportedAt: new Date(),
      datasets: datasets.map((dataset) => ({
        dataset,
        fileName: `${dataset.replaceAll("_", "-")}.csv`,
        headers: exportHeaders[dataset],
      })),
    })),

  exportPage: organizationManagerIdentityProcedure
    .input(OrganizationExportPageSchema)
    .query(async ({ ctx, input }) => {
      const rows = await exportRows(ctx.baseDb, ctx.organizationId, input);
      const page = rows.slice(0, input.limit);
      return {
        rows: page.map((row) =>
          Object.values(row).map((value) =>
            value instanceof Date ? value.toISOString() : value,
          ),
        ),
        nextCursor: rows.length > input.limit ? String(page.at(-1)?.id) : null,
      };
    }),
} satisfies TRPCRouterRecord;
