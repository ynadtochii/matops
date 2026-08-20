import type { PGlite } from "@electric-sql/pglite";
import { TRPCError } from "@trpc/server";

import type { DbExec } from "@matops/db/client";
import { execOn, freshDb } from "@matops/db/testing";

import type { createTRPCContext } from "../src/trpc";
import { appRouter } from "../src/root";

export type Ctx = Awaited<ReturnType<typeof createTRPCContext>>;

export interface Harness {
  pg: PGlite;
  exec: DbExec;
  close: () => Promise<void>;
  as: (userId: string, academyId: string | null) => ReturnType<typeof caller>;
}

function caller(ctx: Ctx) {
  return appRouter.createCaller(ctx);
}

const notWired = new Proxy(
  {},
  {
    get(_t, key) {
      return () => {
        throw new Error(
          `ctx.authApi.${String(key)}() is not available in router tests`,
        );
      };
    },
  },
);

export async function harness(): Promise<Harness> {
  const pg = await freshDb();
  const exec = execOn(pg);

  return {
    pg,
    exec,
    close: () => pg.close(),
    as: (userId, academyId) =>
      caller({
        authApi: notWired as Ctx["authApi"],
        headers: new Headers(),
        session: {
          user: { id: userId, name: `User ${userId}` },
          session: { activeOrganizationId: academyId },
        } as unknown as Ctx["session"],
        baseDb: exec,
      }),
  };
}

/**
 * The tRPC error code a call rejects with, or a readable marker when it does
 * not. Asserting the CODE keeps a permission test tied to the contract rather
 * than to the wording of a message, which is user-facing copy and free to change.
 */
export async function rejectionCode(
  promise: Promise<unknown>,
): Promise<string> {
  try {
    await promise;
    return "resolved without error";
  } catch (err) {
    return err instanceof TRPCError
      ? err.code
      : `non-tRPC error: ${String(err)}`;
  }
}

function lit(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export interface MemberSpec {
  userId: string;
  role: "owner" | "instructor" | "student" | "member";
  status: "pending" | "active" | "suspended" | "removed";
  name?: string;
  invitedRole?: string;
}

export interface AcademySpec {
  id: string;
  code: string;
  members: MemberSpec[];
}

export function memberId(academyId: string, userId: string): string {
  return `mem_${academyId}_${userId}`;
}

export async function seedAcademies(
  pg: PGlite,
  academies: AcademySpec[],
): Promise<void> {
  const seen = new Set<string>();
  const users: string[] = [];
  const orgs: string[] = [];
  const members: string[] = [];

  for (const academy of academies) {
    orgs.push(
      `(${lit(academy.id)}, ${lit(`Academy ${academy.id}`)}, ${lit(`slug-${academy.id}`)}, ${lit(academy.code)}, now())`,
    );
    for (const m of academy.members) {
      if (!seen.has(m.userId)) {
        seen.add(m.userId);
        users.push(
          `(${lit(m.userId)}, ${lit(m.name ?? `User ${m.userId}`)}, ${lit(`${m.userId}@test.local`)}, true, now(), now())`,
        );
      }
      members.push(
        `(${lit(memberId(academy.id, m.userId))}, ${lit(academy.id)}, ${lit(m.userId)}, ${lit(m.role)}, ${lit(m.status)}, ${m.invitedRole ? lit(m.invitedRole) : "NULL"}, now())`,
      );
    }
  }

  await pg.exec(`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES ${users.join(",")};
    INSERT INTO "organization" (id, name, slug, public_code, created_at)
      VALUES ${orgs.join(",")};
    INSERT INTO "member" (id, organization_id, user_id, role, status, invited_role, created_at)
      VALUES ${members.join(",")};
  `);
}

export interface ClassSpec {
  id: string;
  academyId: string;
  instructorId: string;
  title?: string;
  startsInMinutes: number;
  durationMinutes?: number;
  capacity?: number;
  status?: "scheduled" | "cancelled";
}

export async function seedClasses(
  pg: PGlite,
  classes: ClassSpec[],
): Promise<void> {
  const values = classes.map(
    (c) =>
      `(${lit(c.id)}, ${lit(c.academyId)}, ${lit(c.instructorId)}, ${lit(c.title ?? "Gi Fundamentals")}, now() + interval '${c.startsInMinutes} minutes', ${c.durationMinutes ?? 60}, ${c.capacity ?? 20}, ${lit(c.status ?? "scheduled")}, now(), now())`,
  );
  await pg.exec(`
    INSERT INTO "class" (id, academy_id, instructor_id, title, starts_at, duration_minutes, capacity, status, created_at, updated_at)
      VALUES ${values.join(",")};
  `);
}

export interface ParticipationSpec {
  classId: string;
  academyId: string;
  studentId: string;
  attendanceStatus?: "unmarked" | "present" | "absent";
  bookingStatus?: "booked" | "cancelled" | "none";
  bookingTier?: "confirmed" | "provisional";
}

export async function seedParticipations(
  pg: PGlite,
  rows: ParticipationSpec[],
): Promise<void> {
  const values = rows.map(
    (r) =>
      `(gen_random_uuid(), ${lit(r.academyId)}, ${lit(r.classId)}, ${lit(r.studentId)}, ${lit(r.bookingStatus ?? "booked")}, ${lit(r.bookingTier ?? "confirmed")}, ${lit(r.attendanceStatus ?? "unmarked")}, now(), now(), now())`,
  );
  await pg.exec(`
    INSERT INTO "class_participation" (id, academy_id, class_id, student_id, booking_status, booking_tier, attendance_status, booked_at, created_at, updated_at)
      VALUES ${values.join(",")};
  `);
}

export async function storedBookingCount(
  pg: PGlite,
  classId: string,
): Promise<number> {
  const res = await pg.query<{ n: number }>(
    `SELECT booking_count AS n FROM "class" WHERE id = $1`,
    [classId],
  );
  return res.rows[0]?.n ?? -1;
}

export async function confirmedBookings(
  pg: PGlite,
  classId: string,
): Promise<number> {
  const res = await pg.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM "class_participation"
      WHERE class_id = $1 AND booking_status = 'booked' AND booking_tier = 'confirmed'`,
    [classId],
  );
  return res.rows[0]?.n ?? -1;
}
