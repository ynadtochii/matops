/**
 * Pure notification rules (Phase 4, spec S7/§4; docs/issues/17, 34). No I/O:
 * these turn events into message text and decide the reminder window. The
 * transport (Expo Push) lives in `packages/notifications`; recipient
 * resolution (userIds → tokens) lives in the API layer. Keeping the
 * message text here makes it trivially unit-testable.
 */

/** A push/in-app message: a short title + a one-line body. */
export interface PushMessage {
  title: string;
  body: string;
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

/** Class cancelled → the highest-stakes event. */
export function buildCancelledMessage(input: {
  academyName: string;
  className: string;
  whenLabel: string;
}): PushMessage {
  const { academyName, className, whenLabel } = input;
  return {
    title: "Class cancelled",
    body: `${className} on ${whenLabel} at ${academyName} was cancelled.`,
  };
}

/** Class time or instructor changed → notify booked students. */
export function buildClassChangeMessage(input: {
  academyName: string;
  className: string;
  whenLabel: string;
}): PushMessage {
  const { academyName, className, whenLabel } = input;
  return {
    title: "Class updated",
    body: `${className} at ${academyName} changed — now ${whenLabel}.`,
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
 * a member is due soon or overdue. `amountLabel`/`dueLabel` are pre-formatted
 * upstream (same pattern as the class builders' `whenLabel`), keeping this pure
 * and locale-free.
 */
export function buildDuesReminderMessage(input: {
  academyName: string;
  amountLabel: string;
  dueLabel: string;
  overdue: boolean;
}): PushMessage {
  const { academyName, amountLabel, dueLabel, overdue } = input;
  return {
    title: overdue ? "Payment overdue" : "Membership due soon",
    body: overdue
      ? `Your ${amountLabel} dues at ${academyName} are overdue.`
      : `Your ${amountLabel} dues at ${academyName} are due ${dueLabel}.`,
  };
}

/** Default reminder lead time (how long before start the reminder fires). */
export const REMINDER_LEAD_MINUTES = 120;

/** What produced an inbox entry. Persisted as text on `notification.kind`. */
export type NotificationKind =
  | "class_cancelled"
  | "class_changed"
  | "class_reminder"
  | "dues_reminder"
  | "membership_due"
  | "membership_approved"
  | "membership_update"
  | "announcement";

/** Short label for the inbox row, so both clients spell the kinds the same. */
const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  class_cancelled: "Class cancelled",
  class_changed: "Class updated",
  class_reminder: "Class reminder",
  dues_reminder: "Membership dues",
  membership_due: "Membership dues",
  membership_approved: "Membership",
  membership_update: "Membership",
  announcement: "Gym news",
};

/**
 * The inbox row's label for a persisted `kind`. Takes a plain string because the
 * column is text: a row written by an older deploy must still render, so an
 * unknown kind falls back rather than crashing the feed.
 */
export function notificationKindLabel(kind: string): string {
  return kind in NOTIFICATION_KIND_LABEL
    ? NOTIFICATION_KIND_LABEL[kind as NotificationKind]
    : "Update";
}
