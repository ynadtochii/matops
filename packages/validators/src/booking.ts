import { z } from "zod/v4";

import { blockText, IdSchema, lineText, personFields } from "./fields";

// ─── Booking (Phase 3) ───────────────────────────────────────────────────────

/**
 * Book a concrete class (spec S5, docs/issues/13). Booking is never blocked —
 * the router applies the soft-capacity + tier rules from @matops/domain. A
 * pending member may book too (provisional); the tier is decided server-side
 * from the caller's membership, so it is not an input here.
 */
export const BookClassSchema = z.object({ classId: z.uuid() });
export type BookClassInput = z.infer<typeof BookClassSchema>;

/** Cancel the caller's own booking on a class (spec S5). */
export const CancelBookingSchema = z.object({ classId: z.uuid() });
export type CancelBookingInput = z.infer<typeof CancelBookingSchema>;

// ─── Attendance (Phase 3, slice 3.3) ─────────────────────────────────────────

/** Attendance mark a staff member can set on a participant (spec O5). */
export const AttendanceStatusSchema = z.enum(["present", "absent", "unmarked"]);
export type AttendanceStatusInput = z.infer<typeof AttendanceStatusSchema>;

const attendanceReason = blockText(3, 500).optional();

/** Mark one participant present/absent/unmarked on a class (spec O5). */
export const MarkAttendanceSchema = z
  .union([
    z.object({
      classId: z.uuid(),
      personId: IdSchema,
      status: AttendanceStatusSchema,
      reason: attendanceReason,
    }),
    z.object({
      classId: z.uuid(),
      studentId: IdSchema,
      status: AttendanceStatusSchema,
      reason: attendanceReason,
    }),
  ])
  .transform((input) => ({
    classId: input.classId,
    personId: "personId" in input ? input.personId : input.studentId,
    status: input.status,
    reason: input.reason,
  }));
export type MarkAttendanceInput = z.infer<typeof MarkAttendanceSchema>;

/** Add a walk-in: mark a member present who never booked (spec O5). */
export const AddWalkInSchema = z
  .union([
    z.object({
      classId: z.uuid(),
      personId: IdSchema,
      reason: attendanceReason,
    }),
    z.object({
      classId: z.uuid(),
      studentId: IdSchema,
      reason: attendanceReason,
    }),
  ])
  .transform((input) => ({
    classId: input.classId,
    personId: "personId" in input ? input.personId : input.studentId,
    reason: input.reason,
  }));
export type AddWalkInInput = z.infer<typeof AddWalkInSchema>;

/**
 * Record a visitor who is not a member, from the class roster (spec O5/O4).
 * Staff type this at the mat, so it asks for the least that still identifies a
 * person: a name and the phone the lead is deduped by. Last name is optional
 * and `consent` is absent by design — the visitor is not at the keyboard, so
 * the gym cannot tick a contact-consent box on their behalf.
 */
export const AddVisitorSchema = z.object({
  classId: z.uuid(),
  ...personFields,
  lastName: lineText(0, 60).default(""),
  reason: attendanceReason,
});
export type AddVisitorInput = z.infer<typeof AddVisitorSchema>;

/** Mark a visitor present or absent on the class register (spec O5, ADR 115). */
export const MarkVisitorSchema = z.object({
  classId: z.uuid(),
  visitId: z.uuid(),
  status: AttendanceStatusSchema,
  reason: attendanceReason,
});
export type MarkVisitorInput = z.infer<typeof MarkVisitorSchema>;

export const MarkAllAttendanceSchema = z.object({
  id: z.uuid(),
  reason: attendanceReason,
});

export const AttendanceReviewQueueSchema = z
  .object({
    status: z.enum(["needs_review", "all"]).default("needs_review"),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    offset: z.number().int().min(0).max(1000000).default(0),
  })
  .refine((input) => !input.from || !input.to || input.from <= input.to, {
    message: "The end date must follow the start date.",
    path: ["to"],
  });

export const FinishAttendanceSchema = z.object({
  id: z.uuid(),
  fingerprint: z.string().regex(/^[a-f0-9]{32}$/),
  nobodyAttended: z.boolean().default(false),
  reason: attendanceReason,
});
