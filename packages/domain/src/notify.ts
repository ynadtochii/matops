/**
 * Pure notification rules (Phase 4, spec S7/§4; docs/issues/17, 34). No I/O:
 * these turn events into message text and decide the reminder window. The
 * transport (Expo Push / Resend) lives in `packages/notifications`; recipient
 * resolution (userIds → tokens/emails) lives in the API layer. Keeping the
 * message text here makes it trivially unit-testable.
 */

/** A push/in-app message: a short title + a one-line body. */
export interface PushMessage {
  title: string;
  body: string;
}

/** An email message: subject + a plain-text body (html is optional upstream). */
export interface EmailMessage {
  subject: string;
  text: string;
}

/**
 * Format a class start instant as a human label in a given IANA time zone.
 * Deterministic given the zone (uses Intl), so it is safe in pure tests. Falls
 * back to UTC when the caller has no zone (the class row stores only the UTC
 * instant; only its template carries the zone).
 */
export function formatWhen(startsAt: Date, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(startsAt);
}

/** Class cancelled → the highest-stakes event (push + email). */
export function buildCancelledMessage(input: {
  academyName: string;
  className: string;
  whenLabel: string;
}): { push: PushMessage; email: EmailMessage } {
  const { academyName, className, whenLabel } = input;
  const title = "Class cancelled";
  const body = `${className} on ${whenLabel} at ${academyName} was cancelled.`;
  return {
    push: { title, body },
    email: {
      subject: `Cancelled: ${className} — ${whenLabel}`,
      text: `Your booked class was cancelled.\n\n${className}\n${whenLabel}\n${academyName}\n\nNo action is needed — the class will not run.`,
    },
  };
}

/** Class time or instructor changed → notify booked students (push + email). */
export function buildClassChangeMessage(input: {
  academyName: string;
  className: string;
  whenLabel: string;
}): { push: PushMessage; email: EmailMessage } {
  const { academyName, className, whenLabel } = input;
  const title = "Class updated";
  const body = `${className} at ${academyName} changed — now ${whenLabel}.`;
  return {
    push: { title, body },
    email: {
      subject: `Updated: ${className} — ${whenLabel}`,
      text: `A class you booked was updated.\n\n${className}\n${whenLabel}\n${academyName}\n\nCheck the app for the latest details.`,
    },
  };
}

/** Membership approved → welcome push to the newly approved member. */
export function buildApprovalMessage(input: {
  academyName: string;
}): PushMessage {
  return {
    title: "You're in!",
    body: `Welcome to ${input.academyName}. You can book classes now.`,
  };
}

/** Class reminder (~lead time before start) → push to booked students. */
export function buildReminderMessage(input: {
  className: string;
  whenLabel: string;
}): PushMessage {
  return {
    title: "Class reminder",
    body: `${input.className} starts ${input.whenLabel}.`,
  };
}

/**
 * Dues reminder (v1.3, R.1 — docs/issues/40). One per billing period, sent when
 * a member is due soon or overdue. Push + email so it lands even with pushes off.
 * `amountLabel`/`dueLabel` are pre-formatted upstream (same pattern as the class
 * builders' `whenLabel`), keeping this pure and locale-free.
 */
export function buildDuesReminderMessage(input: {
  academyName: string;
  amountLabel: string;
  dueLabel: string;
  overdue: boolean;
}): { push: PushMessage; email: EmailMessage } {
  const { academyName, amountLabel, dueLabel, overdue } = input;
  const title = overdue ? "Payment overdue" : "Membership due soon";
  const body = overdue
    ? `Your ${amountLabel} dues at ${academyName} are overdue.`
    : `Your ${amountLabel} dues at ${academyName} are due ${dueLabel}.`;
  return {
    push: { title, body },
    email: {
      subject: overdue
        ? `Overdue: your ${academyName} membership`
        : `Reminder: your ${academyName} membership is due ${dueLabel}`,
      text: `${body}\n\nTransfer the amount in your bank app, then open the app and tap “I paid” — your gym will confirm it.`,
    },
  };
}

/** Default reminder lead time (how long before start the reminder fires). */
export const REMINDER_LEAD_MINUTES = 120;
const MIN_MS = 60 * 1000;

/**
 * Whether a class start falls in the reminder window for this sweep: from
 * `leadMinutes` before start, back to one sweep interval earlier, so a class is
 * caught exactly once as the horizon crosses it. Combined with a persisted
 * `reminder_sent_at` guard, the send is idempotent even if sweeps overlap.
 */
export function isInReminderWindow(
  startsAt: Date,
  now: Date,
  opts: { leadMinutes?: number; sweepMinutes: number },
): boolean {
  const lead = opts.leadMinutes ?? REMINDER_LEAD_MINUTES;
  const dueAt = startsAt.getTime() - lead * MIN_MS;
  const t = now.getTime();
  // Fire once `now` reaches the due point, but not for classes already started.
  return (
    t >= dueAt &&
    t - dueAt < opts.sweepMinutes * MIN_MS &&
    t < startsAt.getTime()
  );
}

/** A booking row, reduced to what recipient selection needs. */
export interface Participation {
  studentId: string;
  bookingStatus: string; // "booked" | "cancelled" | "none"
}

/**
 * The student ids that should be notified about a class: those with a live
 * booking (`booked`), never cancelled bookings or walk-ins (`none`). Deduped.
 */
export function reminderRecipients(participations: Participation[]): string[] {
  const ids = new Set<string>();
  for (const p of participations) {
    if (p.bookingStatus === "booked") ids.add(p.studentId);
  }
  return [...ids];
}
