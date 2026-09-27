import { and, eq, gte, isNull, lt, ne, or, sql } from "drizzle-orm";

import type { LeadSource } from "@matops/domain";
import { matchLeadByPhone } from "@matops/domain";

import type { DbExec } from "./client";
import type { DbReader, DbWriter } from "./tenant";
import { entity } from "./entity-schema";
import {
  bumpScheduleRevision,
  lockAndReadScheduleRevision,
} from "./schedule-guard";
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
  timeZone: string | null;
  country: string | null;
} | null> {
  const rows = await exec
    .select({
      academyId: entity.id,
      name: entity.name,
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

interface CreateDropInInput {
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
    await lockAndReadScheduleRevision(exec, input.academyId);
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
    await bumpScheduleRevision(exec, input.academyId);
  }
  return { dropInId, visitCount: await countPresentVisits(dropInId, exec) };
}

interface BookVisitorInput extends Omit<CreateDropInInput, "classId"> {
  classId: string;
}

interface BookVisitorResult extends DropInResult {
  visitId: string;
}

/**
 * Book a visitor onto a later class from the wall-QR drop-in form. Idempotent
 * by `(drop_in_id, class_id)`: the same phone posting twice gets the same
 * booking back, so a double tap on a bad connection is harmless. A cancelled
 * booking is revived.
 */
export async function bookVisitor(
  input: BookVisitorInput,
  exec: DbWriter,
): Promise<BookVisitorResult> {
  await lockAndReadScheduleRevision(exec, input.academyId);
  const dropInId = await upsertLead(input, exec);
  const now = new Date();
  const [bookedClass] = await exec
    .select({ id: classInstance.id })
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
  const [existing] = await exec
    .select({ status: dropInVisit.bookingStatus })
    .from(dropInVisit)
    .where(
      and(
        eq(dropInVisit.dropInId, dropInId),
        eq(dropInVisit.classId, input.classId),
      ),
    )
    .limit(1);
  if (existing?.status !== "booked") {
    const [seat] = await exec
      .update(classInstance)
      .set({ bookingCount: sql`${classInstance.bookingCount} + 1` })
      .where(
        and(
          eq(classInstance.id, input.classId),
          eq(classInstance.academyId, input.academyId),
          eq(classInstance.status, "scheduled"),
          isNull(classInstance.deletedAt),
          or(
            eq(classInstance.capacity, 0),
            lt(classInstance.bookingCount, classInstance.capacity),
          ),
        ),
      )
      .returning({ id: classInstance.id });
    if (!seat) throw new Error("Class is full");
  }
  const [row] = await exec
    .insert(dropInVisit)
    .values({
      academyId: input.academyId,
      dropInId,
      classId: input.classId,
      bookingStatus: "booked",
      attendanceStatus: "unmarked",
      bookedAt: now,
    })
    .onConflictDoUpdate({
      target: [dropInVisit.dropInId, dropInVisit.classId],
      set: {
        bookingStatus: "booked",
        cancelledAt: null,
        bookedAt: sql`coalesce(${dropInVisit.bookedAt}, ${now})`,
      },
    })
    .returning({ id: dropInVisit.id });
  if (!row) throw new Error("drop_in_visit upsert returned no row");
  if (existing?.status !== "booked") {
    await bumpScheduleRevision(exec, input.academyId);
  }
  return {
    dropInId,
    visitId: row.id,
    visitCount: await countPresentVisits(dropInId, exec),
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
