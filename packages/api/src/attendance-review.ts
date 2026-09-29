import type { TenantTx } from "@matops/db";
import { attendanceReviewSnapshot, eq, sql } from "@matops/db";
import {
  classInstance,
  classParticipation,
  dropIn,
  dropInVisit,
  person,
  user,
} from "@matops/db/schema";
import { attendanceReview } from "@matops/domain";

type MemberRow = Pick<
  typeof classParticipation.$inferSelect,
  "bookingStatus" | "bookingTier" | "attendanceStatus"
> & { studentId: string; name: string | null; attendedAt: string | null };
type VisitorRow = Pick<
  typeof dropInVisit.$inferSelect,
  "id" | "bookingStatus" | "attendanceStatus"
> & {
  leadId: string;
  firstName: string;
  lastName: string;
  phone: string;
  belt: string | null;
  stripes: number | null;
  health: string | null;
};

export async function loadAttendanceRoster(db: TenantTx, classId: string) {
  const [row] = await db
    .select({
      startsAt: classInstance.startsAt,
      durationMinutes: classInstance.durationMinutes,
      status: classInstance.status,
      deletedAt: classInstance.deletedAt,
      reviewedAt: classInstance.attendanceReviewedAt,
      reviewerId: classInstance.attendanceReviewedBy,
      reviewerName: user.name,
      savedFingerprint: classInstance.attendanceReviewFingerprint,
      snapshot: attendanceReviewSnapshot(),
      rows: sql<MemberRow[]>`${sql`coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'studentId', coalesce(${classParticipation.personId}::text, ${classParticipation.studentId}), 'name', coalesce(${person.name}, ${user.name}),
        'bookingStatus', ${classParticipation.bookingStatus}, 'bookingTier', ${classParticipation.bookingTier},
        'attendanceStatus', ${classParticipation.attendanceStatus}, 'attendedAt', ${classParticipation.attendedAt}
      ) ORDER BY ${classParticipation.id})
      FROM ${classParticipation}
      LEFT JOIN ${person} ON ${person.id} = ${classParticipation.personId}
      LEFT JOIN ${user} ON ${user.id} = ${classParticipation.studentId}
      WHERE ${classParticipation.classId} = ${classInstance.id}
        AND ${classParticipation.academyId} = ${classInstance.academyId}
    ), '[]'::jsonb)`}`,
      dropIns: sql<VisitorRow[]>`${sql`coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ${dropInVisit.id}, 'leadId', ${dropIn.id}, 'firstName', ${dropIn.firstName},
        'lastName', ${dropIn.lastName}, 'phone', ${dropIn.phone},
        'belt', ${dropIn.belt}, 'stripes', ${dropIn.stripes},
        'health', CASE WHEN ${dropInVisit.bookingStatus} <> 'cancelled' THEN ${dropIn.health} END,
        'bookingStatus', ${dropInVisit.bookingStatus}, 'attendanceStatus', ${dropInVisit.attendanceStatus}
      ) ORDER BY ${dropInVisit.id})
      FROM ${dropInVisit} INNER JOIN ${dropIn} ON ${dropIn.id} = ${dropInVisit.dropInId}
      WHERE ${dropInVisit.classId} = ${classInstance.id}
        AND ${dropInVisit.academyId} = ${classInstance.academyId}
        AND (${dropInVisit.bookingStatus} <> 'cancelled' OR ${dropInVisit.attendanceStatus} <> 'unmarked')
    ), '[]'::jsonb)`}`,
    })
    .from(classInstance)
    .leftJoin(user, eq(user.id, classInstance.attendanceReviewedBy))
    .where(eq(classInstance.id, classId));
  if (!row) return null;
  return {
    ...row,
    rows: row.rows.map((member) => ({
      ...member,
      attendedAt: member.attendedAt ? new Date(member.attendedAt) : null,
    })),
    review: {
      ...attendanceReview(row.snapshot, row.savedFingerprint, row.reviewedAt),
      reviewer: row.reviewerId
        ? { id: row.reviewerId, name: row.reviewerName }
        : null,
    },
  };
}
