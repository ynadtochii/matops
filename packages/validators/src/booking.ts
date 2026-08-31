import { z } from "zod/v4";

import { IdSchema, lineText, personFields } from "./fields";

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

/** Mark one participant present/absent/unmarked on a class (spec O5). */
export const MarkAttendanceSchema = z.object({
  classId: z.uuid(),
  studentId: IdSchema,
  status: AttendanceStatusSchema,
});
export type MarkAttendanceInput = z.infer<typeof MarkAttendanceSchema>;

/** Add a walk-in: mark a member present who never booked (spec O5). */
export const AddWalkInSchema = z.object({
  classId: z.uuid(),
  studentId: IdSchema,
});
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
});
export type AddVisitorInput = z.infer<typeof AddVisitorSchema>;

/** Mark a visitor present or absent on the class register (spec O5, ADR 115). */
export const MarkVisitorSchema = z.object({
  classId: z.uuid(),
  visitId: z.uuid(),
  status: AttendanceStatusSchema,
});
export type MarkVisitorInput = z.infer<typeof MarkVisitorSchema>;
