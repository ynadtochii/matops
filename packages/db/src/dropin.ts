import { and, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";

import type { LeadSource } from "@matops/domain";
import { matchLeadByPhone } from "@matops/domain";

import type { DbExec } from "./client";
import type { DbReader, DbWriter } from "./tenant";
import { entity } from "./entity-schema";
import { classInstance, dropIn, dropInVisit } from "./scheduling";

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
  exec: DbReader,
): Promise<{
  academyId: string;
  name: string;
  type: string;
  timeZone: string | null;
  country: string | null;
} | null> {
  const rows = await exec
    .select({
      academyId: entity.id,
      name: entity.name,
      type: entity.type,
      timeZone: entity.timeZone,
      country: entity.country,
    })
    .from(entity)
    .where(and(eq(entity.id, academyId), isNull(entity.deletedAt)))
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
  exec: DbExec,
): Promise<
  {
    id: string;
    title: string;
    startsAt: Date;
    durationMinutes: number;
    status: string;
  }[]
> {
  return exec
    .select({
      id: classInstance.id,
      title: classInstance.title,
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
  source: LeadSource;
}

export interface DropInResult {
  dropInId: string;
  visitCount: number;
}

/**
 * Upsert the lead itself, deduped by `(academy_id, phone)`. Contact fields are
 * merged, never replaced: staff recording a visitor at the desk pass no email
 * and may pass an empty last name, and that must not erase what the visitor
 * typed on the form themselves.
 */
async function upsertLead(
  input: Omit<CreateDropInInput, "classId">,
  exec: DbWriter,
): Promise<string> {
  const now = new Date();
  const [row] = await exec
    .insert(dropIn)
    .values({
      academyId: input.academyId,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      email: input.email,
      consent: input.consent,
      source: input.source,
    })
    .onConflictDoUpdate({
      target: [dropIn.academyId, dropIn.phone],
      set: {
        firstName: sql`coalesce(nullif(${input.firstName}::text, ''), ${dropIn.firstName})`,
        lastName: sql`coalesce(nullif(${input.lastName}::text, ''), ${dropIn.lastName})`,
        email: sql`coalesce(${input.email}::text, ${dropIn.email})`,
        consent: sql`${dropIn.consent} OR ${input.consent}`,
        lastVisitAt: now,
      },
    })
    .returning({ id: dropIn.id });
  if (!row) throw new Error("drop_in upsert returned no row");
  return row.id;
}

/** How many classes this lead actually turned up to (spec O4 activity line). */
async function countPresentVisits(
  dropInId: string,
  exec: DbReader,
): Promise<number> {
  const [row] = await exec
    .select({ n: sql<number>`count(*)::int` })
    .from(dropInVisit)
    .where(
      and(
        eq(dropInVisit.dropInId, dropInId),
        eq(dropInVisit.attendanceStatus, "present"),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Record a visitor who turned up: the lead plus, when a class is known, one
 * `drop_in_visit` marked present. Deduped by phone, so the gym QR form and the
 * staff "Add visitor" box converge on one lead. Returns how many classes the
 * lead has attended (1 = first visit).
 */
export async function createDropIn(
  input: CreateDropInInput,
  exec: DbWriter,
): Promise<DropInResult> {
  const dropInId = await upsertLead(input, exec);
  if (input.classId) {
    const now = new Date();
    await exec
      .insert(dropInVisit)
      .values({
        academyId: input.academyId,
        dropInId,
        classId: input.classId,
        bookingStatus: "none",
        attendanceStatus: "present",
        attendedAt: now,
      })
      .onConflictDoUpdate({
        target: [dropInVisit.dropInId, dropInVisit.classId],
        set: { attendanceStatus: "present", attendedAt: now },
      });
  }
  return { dropInId, visitCount: await countPresentVisits(dropInId, exec) };
}

export interface BookVisitorInput extends Omit<CreateDropInInput, "classId"> {
  classId: string;
  cancelToken: string;
}

export interface BookVisitorResult extends DropInResult {
  visitId: string;
  cancelToken: string;
}

/**
 * Book a visitor onto a class from the public API. Idempotent by
 * `(drop_in_id, class_id)`: the same phone posting twice gets the same booking
 * and the same cancel token back, so a double tap on a bad connection is
 * harmless. A cancelled booking is revived and keeps the token the caller was
 * already given.
 */
export async function bookVisitor(
  input: BookVisitorInput,
  exec: DbWriter,
): Promise<BookVisitorResult> {
  const dropInId = await upsertLead(input, exec);
  const now = new Date();
  const cancelTokenExpiresAt = new Date(
    now.getTime() + 30 * 24 * 60 * 60 * 1000,
  );
  const [bookedClass] = await exec
    .select({ startsAt: classInstance.startsAt })
    .from(classInstance)
    .where(
      and(
        eq(classInstance.id, input.classId),
        eq(classInstance.academyId, input.academyId),
        eq(classInstance.status, "scheduled"),
        isNull(classInstance.deletedAt),
      ),
    )
    .limit(1);
  if (!bookedClass) throw new Error("Class is no longer open for booking");
  const [row] = await exec
    .insert(dropInVisit)
    .values({
      academyId: input.academyId,
      dropInId,
      classId: input.classId,
      bookingStatus: "booked",
      attendanceStatus: "unmarked",
      cancelToken: input.cancelToken,
      cancelTokenExpiresAt,
      bookedClassStartsAt: bookedClass.startsAt,
      bookedAt: now,
    })
    .onConflictDoUpdate({
      target: [dropInVisit.dropInId, dropInVisit.classId],
      set: {
        bookingStatus: "booked",
        cancelledAt: null,
        bookedAt: sql`coalesce(${dropInVisit.bookedAt}, ${now})`,
        cancelToken: sql`coalesce(${dropInVisit.cancelToken}, ${input.cancelToken})`,
        cancelTokenExpiresAt: sql`case when ${dropInVisit.bookingStatus} = 'cancelled' then ${cancelTokenExpiresAt} else coalesce(${dropInVisit.cancelTokenExpiresAt}, ${cancelTokenExpiresAt}) end`,
        bookedClassStartsAt: sql`case when ${dropInVisit.bookingStatus} = 'cancelled' then ${bookedClass.startsAt} else coalesce(${dropInVisit.bookedClassStartsAt}, ${bookedClass.startsAt}) end`,
      },
    })
    .returning({ id: dropInVisit.id, cancelToken: dropInVisit.cancelToken });
  if (!row?.cancelToken)
    throw new Error("drop_in_visit upsert returned no row");
  return {
    dropInId,
    visitId: row.id,
    cancelToken: row.cancelToken,
    visitCount: await countPresentVisits(dropInId, exec),
  };
}

/**
 * Cancel a visitor booking by its public token. The LEAD survives: someone who
 * cancelled still wanted to train and the gym still wants their number. Scoped
 * to the academy the caller's key names, so one gym's key can never reach
 * another gym's booking even if it learns the token. Returns false when the
 * token is unknown, so the endpoint answers the same either way.
 */
export async function cancelVisitorBooking(
  academyId: string,
  cancelToken: string,
  exec: DbWriter,
  now = new Date(),
): Promise<boolean> {
  const rows = await exec
    .update(dropInVisit)
    .set({ bookingStatus: "cancelled", cancelledAt: now })
    .where(
      and(
        eq(dropInVisit.academyId, academyId),
        eq(dropInVisit.cancelToken, cancelToken),
        gte(dropInVisit.cancelTokenExpiresAt, now),
      ),
    )
    .returning({ id: dropInVisit.id });
  return rows.length > 0;
}

export async function getVisitorBookingStatus(
  academyId: string,
  cancelToken: string,
  exec: DbReader,
  now = new Date(),
): Promise<{
  bookingStatus: string;
  tokenExpiresAt: Date;
  class: {
    id: string;
    title: string;
    startsAt: Date;
    durationMinutes: number;
    status: string;
    changed: boolean;
  };
} | null> {
  const [row] = await exec
    .select({
      bookingStatus: dropInVisit.bookingStatus,
      tokenExpiresAt: dropInVisit.cancelTokenExpiresAt,
      bookedClassStartsAt: dropInVisit.bookedClassStartsAt,
      classId: classInstance.id,
      classTitle: classInstance.title,
      classStartsAt: classInstance.startsAt,
      classDurationMinutes: classInstance.durationMinutes,
      classStatus: classInstance.status,
    })
    .from(dropInVisit)
    .innerJoin(classInstance, eq(classInstance.id, dropInVisit.classId))
    .where(
      and(
        eq(dropInVisit.academyId, academyId),
        eq(dropInVisit.cancelToken, cancelToken),
        gte(dropInVisit.cancelTokenExpiresAt, now),
        isNull(classInstance.deletedAt),
      ),
    )
    .limit(1);
  if (!row?.tokenExpiresAt) return null;
  return {
    bookingStatus: row.bookingStatus,
    tokenExpiresAt: row.tokenExpiresAt,
    class: {
      id: row.classId,
      title: row.classTitle,
      startsAt: row.classStartsAt,
      durationMinutes: row.classDurationMinutes,
      status: row.classStatus,
      changed:
        row.bookedClassStartsAt?.getTime() !== row.classStartsAt.getTime(),
    },
  };
}

/**
 * Stamp the lead this new member came from, matched on the last nine digits of
 * the phone (`matchLeadByPhone`). Runs at self-join, so it works however they
 * joined: invite link, academy code, web or mobile. No per-lead token, nothing
 * to leak or mis-assign. Returns false when there is no lead, or when two leads
 * are equally good candidates.
 */
export async function linkLeadOnJoin(
  academyId: string,
  phone: string,
  userId: string,
  exec: DbExec,
): Promise<boolean> {
  const leads = await exec
    .select({ id: dropIn.id, phone: dropIn.phone })
    .from(dropIn)
    .where(and(eq(dropIn.academyId, academyId), ne(dropIn.stage, "joined")));
  const hit = matchLeadByPhone(leads, phone);
  if (!hit) return false;
  await exec
    .update(dropIn)
    .set({ stage: "joined", convertedUserId: userId })
    .where(eq(dropIn.id, hit.id));
  return true;
}
