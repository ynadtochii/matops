import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";

import { organization } from "./auth-schema";
import { db } from "./client";
import { classInstance, dropIn } from "./scheduling";

/**
 * Drop-in / lead helpers (slice 3.5, docs/issues/25). These run on the BASE
 * connection (the trusted table owner, which bypasses RLS) because the drop-in
 * submit is PUBLIC — an unauthenticated visitor has no session and no academy
 * scope. This is an enumerated exception to the tenant seam (docs/issues/12):
 * every function here validates/pins the academy id explicitly.
 */

/** Public academy info for the drop-in page header; null if the id is unknown. */
export async function getAcademyPublic(
  academyId: string,
): Promise<{ academyId: string; name: string } | null> {
  const rows = await db
    .select({ academyId: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.id, academyId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The academy's non-deleted classes in a time window, for resolving which class
 * a drop-in is attending (fed to `resolveCheckInClass` in the resolver). Base
 * connection, so pinned explicitly to `academyId`.
 */
export async function listAcademyClassesInWindow(
  academyId: string,
  fromMs: number,
  toMs: number,
): Promise<
  { id: string; startsAt: Date; durationMinutes: number; status: string }[]
> {
  return db
    .select({
      id: classInstance.id,
      startsAt: classInstance.startsAt,
      durationMinutes: classInstance.durationMinutes,
      status: classInstance.status,
    })
    .from(classInstance)
    .where(
      and(
        eq(classInstance.academyId, academyId),
        isNull(classInstance.deletedAt),
        gte(classInstance.startsAt, new Date(fromMs)),
        lt(classInstance.startsAt, new Date(toMs)),
      ),
    );
}

export interface CreateDropInInput {
  academyId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  classId: string | null;
  consent: boolean;
}

/**
 * Record a drop-in lead + attendance, deduped by `(academy_id, phone)`. A repeat
 * phone bumps `visit_count` and refreshes the contact / class instead of adding a
 * row (spec §4). Returns the lead's visit count (1 = first visit).
 */
export async function createDropIn(
  input: CreateDropInInput,
): Promise<{ visitCount: number }> {
  const now = new Date();
  const [row] = await db
    .insert(dropIn)
    .values({
      academyId: input.academyId,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      email: input.email,
      classId: input.classId,
      consent: input.consent,
    })
    .onConflictDoUpdate({
      target: [dropIn.academyId, dropIn.phone],
      set: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        classId: input.classId,
        consent: sql`${dropIn.consent} OR ${input.consent}`,
        visitCount: sql`${dropIn.visitCount} + 1`,
        lastVisitAt: now,
      },
    })
    .returning({ visitCount: dropIn.visitCount });
  return { visitCount: row?.visitCount ?? 1 };
}
