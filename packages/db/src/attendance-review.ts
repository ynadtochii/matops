import { sql } from "drizzle-orm";

import type { AttendanceReviewSnapshot } from "@matops/domain";

import { classInstance, classParticipation, dropInVisit } from "./scheduling";

export function attendanceReviewSnapshot() {
  return sql<AttendanceReviewSnapshot>`${sql`(
    SELECT jsonb_build_object(
      'fingerprint', md5(coalesce(string_agg(
        kind || ':' || id::text || ':' || booking_status || ':' || attendance_status,
        ',' ORDER BY kind, id
      ), '')),
      'unmarked', count(*) FILTER (WHERE booking_status <> 'cancelled' AND attendance_status = 'unmarked'),
      'present', count(*) FILTER (WHERE attendance_status = 'present'),
      'absent', count(*) FILTER (WHERE attendance_status = 'absent'),
      'total', count(*) FILTER (WHERE booking_status <> 'cancelled' OR attendance_status <> 'unmarked')
    )
    FROM (
      SELECT 'member' AS kind, ${classParticipation.id} AS id,
        ${classParticipation.bookingStatus}::text AS booking_status,
        ${classParticipation.attendanceStatus}::text AS attendance_status
      FROM ${classParticipation}
      WHERE ${classParticipation.classId} = ${classInstance.id}
        AND ${classParticipation.academyId} = ${classInstance.academyId}
      UNION ALL
      SELECT 'visitor' AS kind, ${dropInVisit.id} AS id,
        ${dropInVisit.bookingStatus}::text AS booking_status,
        ${dropInVisit.attendanceStatus}::text AS attendance_status
      FROM ${dropInVisit}
      WHERE ${dropInVisit.classId} = ${classInstance.id}
        AND ${dropInVisit.academyId} = ${classInstance.academyId}
    ) AS attendance_rows
  )`}`;
}
