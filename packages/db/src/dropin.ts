import { randomBytes } from "node:crypto";
import { and, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";

import type { SignupAnswers } from "@matops/domain";
import {
  checkSignupAnswers,
  matchLeadByPhone,
  resolveAcademyTimeZone,
  returningLeadGate,
  visitorClassState,
} from "@matops/domain";

import type { DbExec } from "./client";
import type { DbReader } from "./tenant";
import { dropInLink } from "./drop-in-link-schema";
import { entity } from "./entity-schema";
import {
  bumpScheduleRevision,
  lockAndReadScheduleRevision,
} from "./schedule-guard";
import { classInstance, dropIn, dropInVisit } from "./scheduling";
import { currentWaiver } from "./waiver";

/**
 * Drop-in / lead helpers (ADR 147). These run on the BASE connection (the
 * trusted table owner, which bypasses RLS) because the drop-in form is PUBLIC:
 * a visitor has no session and no academy scope. This is an enumerated
 * exception to the tenant seam (docs/issues/12): the academy always comes from
 * a live link token, and every query here pins that academy id explicitly.
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

export async function listAcademyClassesInWindow(
  academyId: string,
  fromMs: number,
  toMs: number,
  exec: DbReader,
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

interface DropInLinkRow {
  token: string;
  createdAt: Date;
}

function newLinkToken(): string {
  return randomBytes(18).toString("base64url");
}

const linkCols = { token: dropInLink.token, createdAt: dropInLink.createdAt };

export async function getDropInLink(
  academyId: string,
  exec: DbReader,
): Promise<DropInLinkRow | null> {
  const rows = await exec
    .select(linkCols)
    .from(dropInLink)
    .where(
      and(eq(dropInLink.academyId, academyId), isNull(dropInLink.revokedAt)),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function rotateDropInLink(
  input: { academyId: string; createdBy: string },
  exec: DbExec,
): Promise<DropInLinkRow> {
  return exec.transaction(async (tx) => {
    await tx
      .update(dropInLink)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(dropInLink.academyId, input.academyId),
          isNull(dropInLink.revokedAt),
        ),
      );
    const [row] = await tx
      .insert(dropInLink)
      .values({
        academyId: input.academyId,
        token: newLinkToken(),
        createdBy: input.createdBy,
      })
      .returning(linkCols);
    if (!row) throw new Error("drop_in_link insert returned no row");
    return row;
  });
}

export async function getOrCreateDropInLink(
  input: { academyId: string; createdBy: string },
  exec: DbExec,
): Promise<DropInLinkRow> {
  const live = await getDropInLink(input.academyId, exec);
  if (live) return live;
  await exec
    .insert(dropInLink)
    .values({
      academyId: input.academyId,
      token: newLinkToken(),
      createdBy: input.createdBy,
    })
    .onConflictDoNothing();
  const row = await getDropInLink(input.academyId, exec);
  if (!row) throw new Error("drop_in_link was not created");
  return row;
}

export interface DropInAcademy {
  academyId: string;
  name: string;
  timeZone: string;
  country: string | null;
  signupHealthQuestion: boolean;
  waiver: { id: string; body: string } | null;
}

export async function resolveDropInLink(
  token: string,
  exec: DbReader,
): Promise<DropInAcademy | null> {
  const [row] = await exec
    .select({
      academyId: entity.id,
      name: entity.name,
      timeZone: entity.timeZone,
      country: entity.country,
      signupHealthQuestion: entity.signupHealthQuestion,
      waiverRequired: entity.waiverRequired,
    })
    .from(dropInLink)
    .innerJoin(entity, eq(dropInLink.academyId, entity.id))
    .where(
      and(
        eq(dropInLink.token, token),
        isNull(dropInLink.revokedAt),
        isNull(entity.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  const waiver = row.waiverRequired
    ? await currentWaiver(row.academyId, exec)
    : null;
  return {
    academyId: row.academyId,
    name: row.name,
    timeZone: resolveAcademyTimeZone(row.timeZone),
    country: row.country,
    signupHealthQuestion: row.signupHealthQuestion,
    waiver: waiver ? { id: waiver.id, body: waiver.body } : null,
  };
}

async function findLeadByPhone(
  academyId: string,
  phone: string,
  exec: DbReader,
  lock = false,
) {
  const query = exec
    .select({
      id: dropIn.id,
      firstName: dropIn.firstName,
      email: dropIn.email,
      consent: dropIn.consent,
      belt: dropIn.belt,
      waiverId: dropIn.waiverId,
    })
    .from(dropIn)
    .where(and(eq(dropIn.academyId, academyId), eq(dropIn.phone, phone)))
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  return row ?? null;
}

function sameEmail(stored: string | null, typed: string): boolean {
  return stored !== null && stored.trim().toLowerCase() === typed;
}

async function matchReturningLead(
  academy: DropInAcademy,
  contact: { email: string; phone: string },
  exec: DbReader,
  lock = false,
) {
  const lead = await findLeadByPhone(
    academy.academyId,
    contact.phone,
    exec,
    lock,
  );
  if (!lead || !sameEmail(lead.email, contact.email)) return null;
  const gate = returningLeadGate(lead, academy.waiver?.id ?? null);
  return gate === "full" ? null : { lead, gate };
}

export async function lookupReturningLead(
  academy: DropInAcademy,
  contact: { email: string; phone: string },
  exec: DbReader,
): Promise<{ firstName: string; needsAgreement: boolean } | null> {
  const match = await matchReturningLead(academy, contact, exec);
  return match
    ? {
        firstName: match.lead.firstName,
        needsAgreement: match.gate === "agreement",
      }
    : null;
}

export type DropInSubmission = {
  token: string;
  email: string;
  phone: string;
  classId: string;
} & (
  | { kind: "returning"; waiverId?: string }
  | ({
      kind: "new";
      firstName: string;
      lastName: string;
      consent: true;
    } & SignupAnswers)
);

export type DropInOutcome =
  | {
      ok: true;
      mode: "attend" | "book";
      classTitle: string;
      startsAt: Date;
    }
  | {
      ok: false;
      reason:
        "link" | "class" | "no-match" | "agreement" | "phone-taken" | "answers";
      message?: string;
    };

type Tx = Parameters<Parameters<DbExec["transaction"]>[0]>[0];

async function saveNewLead(
  tx: Tx,
  academy: DropInAcademy,
  input: Extract<DropInSubmission, { kind: "new" }>,
  now: Date,
): Promise<DropInOutcome | string> {
  const checked = checkSignupAnswers({
    healthQuestion: academy.signupHealthQuestion,
    requiredWaiverId: academy.waiver?.id ?? null,
    answers: input,
  });
  if (!checked.ok) {
    return { ok: false, reason: "answers", message: checked.message };
  }
  const answers = checked.values;
  const existing = await findLeadByPhone(
    academy.academyId,
    input.phone,
    tx,
    true,
  );
  if (existing) {
    if (!sameEmail(existing.email, input.email)) {
      return { ok: false, reason: "phone-taken" };
    }
    await tx
      .update(dropIn)
      .set({
        consent: true,
        belt: sql`coalesce(${dropIn.belt}, ${answers.belt}::text)`,
        stripes: sql`coalesce(${dropIn.stripes}, ${answers.stripes}::int)`,
        health: sql`coalesce(${dropIn.health}, ${answers.health}::text)`,
        emailUpdatesAt: answers.emailUpdates
          ? sql`coalesce(${dropIn.emailUpdatesAt}, ${now.toISOString()}::timestamptz)`
          : dropIn.emailUpdatesAt,
        ...(answers.waiverId && {
          waiverId: answers.waiverId,
          waiverAcceptedAt: now,
        }),
        lastVisitAt: now,
      })
      .where(eq(dropIn.id, existing.id));
    return existing.id;
  }
  const [row] = await tx
    .insert(dropIn)
    .values({
      academyId: academy.academyId,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      email: input.email,
      consent: true,
      source: "link",
      belt: answers.belt,
      stripes: answers.stripes,
      health: answers.health,
      emailUpdatesAt: answers.emailUpdates ? now : null,
      waiverId: answers.waiverId,
      waiverAcceptedAt: answers.waiverId ? now : null,
    })
    .returning({ id: dropIn.id });
  if (!row) throw new Error("drop_in insert returned no row");
  return row.id;
}

async function confirmReturningLead(
  tx: Tx,
  academy: DropInAcademy,
  input: Extract<DropInSubmission, { kind: "returning" }>,
  now: Date,
): Promise<DropInOutcome | string> {
  const match = await matchReturningLead(academy, input, tx, true);
  if (!match) return { ok: false, reason: "no-match" };
  const { lead, gate } = match;
  const required = academy.waiver?.id ?? null;
  const accepts = gate === "agreement" && input.waiverId === required;
  if (gate === "agreement" && !accepts) {
    return { ok: false, reason: "agreement" };
  }
  await tx
    .update(dropIn)
    .set({
      lastVisitAt: now,
      ...(accepts && { waiverId: required, waiverAcceptedAt: now }),
    })
    .where(eq(dropIn.id, lead.id));
  return lead.id;
}

export async function submitDropInVisit(
  input: DropInSubmission,
  exec: DbExec,
  now: Date = new Date(),
): Promise<DropInOutcome> {
  return exec.transaction(async (tx) => {
    const academy = await resolveDropInLink(input.token, tx);
    if (!academy) return { ok: false, reason: "link" };
    await lockAndReadScheduleRevision(tx, academy.academyId);

    const [cls] = await tx
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
          eq(classInstance.id, input.classId),
          eq(classInstance.academyId, academy.academyId),
          isNull(classInstance.deletedAt),
        ),
      )
      .limit(1)
      .for("update");
    const mode = cls ? visitorClassState(cls, now, academy.timeZone) : null;
    if (!cls || !mode) return { ok: false, reason: "class" };

    const leadId =
      input.kind === "new"
        ? await saveNewLead(tx, academy, input, now)
        : await confirmReturningLead(tx, academy, input, now);
    if (typeof leadId !== "string") return leadId;

    const [visit] = await tx
      .select({
        bookingStatus: dropInVisit.bookingStatus,
        attendanceStatus: dropInVisit.attendanceStatus,
      })
      .from(dropInVisit)
      .where(
        and(
          eq(dropInVisit.dropInId, leadId),
          eq(dropInVisit.classId, cls.id),
          eq(dropInVisit.academyId, academy.academyId),
        ),
      )
      .limit(1)
      .for("update");

    let changed = false;
    if (mode === "book" && visit?.bookingStatus !== "booked") {
      await tx
        .insert(dropInVisit)
        .values({
          academyId: academy.academyId,
          dropInId: leadId,
          classId: cls.id,
          bookingStatus: "booked",
          attendanceStatus: "unmarked",
          bookedAt: now,
        })
        .onConflictDoUpdate({
          target: [dropInVisit.dropInId, dropInVisit.classId],
          set: { bookingStatus: "booked", cancelledAt: null, bookedAt: now },
        });
      await tx
        .update(classInstance)
        .set({ bookingCount: sql`${classInstance.bookingCount} + 1` })
        .where(
          and(
            eq(classInstance.id, cls.id),
            eq(classInstance.academyId, academy.academyId),
          ),
        );
      changed = true;
    }
    if (mode === "attend" && visit?.attendanceStatus !== "present") {
      await tx
        .insert(dropInVisit)
        .values({
          academyId: academy.academyId,
          dropInId: leadId,
          classId: cls.id,
          bookingStatus: "none",
          attendanceStatus: "present",
          attendedAt: now,
        })
        .onConflictDoUpdate({
          target: [dropInVisit.dropInId, dropInVisit.classId],
          set: { attendanceStatus: "present", attendedAt: now },
        });
      changed = true;
    }
    if (changed) await bumpScheduleRevision(tx, academy.academyId);
    return {
      ok: true,
      mode,
      classTitle: cls.title,
      startsAt: cls.startsAt,
    };
  });
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

export async function takeRateLimit(
  key: string,
  max: number,
  windowMs: number,
  exec: DbExec,
): Promise<boolean> {
  const result = await exec.execute<{ count: number }>(sql`
    insert into rate_limit (key, count, reset_at)
    values (${key}, 1, now() + ${`${windowMs} milliseconds`}::interval)
    on conflict (key) do update set
      count = case when rate_limit.reset_at <= now() then 1 else rate_limit.count + 1 end,
      reset_at = case when rate_limit.reset_at <= now() then excluded.reset_at else rate_limit.reset_at end
    returning count
  `);
  const count = Number(result.rows[0]?.count ?? max + 1);
  if (count === 1) {
    await exec.execute(sql`delete from rate_limit where reset_at < now()`);
  }
  return count <= max;
}
