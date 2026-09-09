import { instantFromLocalDate, localDateISO } from "./materialize";

/**
 * Membership months and their pay deadlines (ADR 126). Pure — no clock reading,
 * no I/O. Every instant here is computed in the ORGANIZATION's own calendar
 * time zone, so one shared membership expires at the same moment at every
 * branch it covers.
 *
 * Months run first to first. There is no rolling anniversary: somebody who
 * joins on the 15th pays for that month, and the next month starts on the 1st
 * like everybody else's.
 */

/**
 * Days a mid-month joiner gets to pay, counted from the day they joined.
 *
 * Fixed at seven on purpose, and NOT the owner's `graceDays`. The two answer
 * different questions: this is how long a new member has to settle up, while
 * `graceDays` is how late an existing member may renew. The plan settled them
 * separately, so a gym that allows fourteen days to renew still gives a joiner
 * seven.
 */
export const JOIN_GRACE_DAYS = 7;

export interface MembershipPolicy {
  /** Days after the 1st that an unpaid month still admits. */
  graceDays: number;
  /** IANA zone the organization counts its months in. */
  timeZone: string;
}

/** A calendar month, written as its first day: "2026-09-01". */
export type MonthKey = string;

/** Add days to a "YYYY-MM-DD" calendar date. Pure date arithmetic, no zone. */
function addDays(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const moved = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days));
  return moved.toISOString().slice(0, 10);
}

/** The month a moment falls in, seen in the organization's zone. */
export function monthOf(instant: Date, timeZone: string): MonthKey {
  return `${localDateISO(instant, timeZone).slice(0, 7)}-01`;
}

/** The month after this one. */
export function nextMonth(month: MonthKey): MonthKey {
  const [y, m] = month.split("-").map(Number);
  const year = (y ?? 0) + ((m ?? 1) === 12 ? 1 : 0);
  const next = (m ?? 1) === 12 ? 1 : (m ?? 1) + 1;
  return `${String(year).padStart(4, "0")}-${String(next).padStart(2, "0")}-01`;
}

/** Is this the month the membership began in? */
function isJoinMonth(month: MonthKey, startMonth: MonthKey): boolean {
  return month === startMonth;
}

interface DeadlineInput {
  /** The month being paid for. */
  month: MonthKey;
  /** The month the membership began in, from `access_assignment.start_month`. */
  startMonth: MonthKey;
  /**
   * The day they actually joined, when that is mid-month. Only read for the
   * join month; leave it out and the join month behaves like any other.
   */
  joinedOn?: string | null;
  policy: MembershipPolicy;
}

/**
 * The moment access stops if this month goes unpaid.
 *
 * A normal month: the 1st plus the owner's grace days, at local midnight. With
 * seven days, September admits on the 1st through the 7th and stops on the 8th
 * at 00:00. The deadline is the first moment that is too late, never the last
 * moment that is in time, so a comparison is a plain `now < deadline`.
 *
 * The join month, when they joined part way through it: the day they joined
 * plus {@link JOIN_GRACE_DAYS}. Joining on 15 September gives them until the
 * 22nd at 00:00. That window may run past the end of the month, and that is
 * fine: it is a deadline for September's payment, not a claim on October, which
 * gets its own month record and its own deadline on the 1st.
 *
 * A day outside the month being charged is not a mid-month join: a plan change
 * made on 6 September writes October's assignment that same day, and October is
 * still due on the 1st.
 *
 * Days are added on the CALENDAR and converted to an instant afterwards, so a
 * daylight-saving change inside the window moves the wall clock, not the
 * boundary: the deadline is midnight wherever the clocks end up.
 */
export function payDeadline(input: DeadlineInput): Date {
  const { month, startMonth, joinedOn, policy } = input;
  const midMonthJoin =
    isJoinMonth(month, startMonth) &&
    joinedOn?.slice(0, 7) === month.slice(0, 7) &&
    !joinedOn.endsWith("-01");
  const from = midMonthJoin ? joinedOn : month;
  const days = midMonthJoin ? JOIN_GRACE_DAYS : policy.graceDays;
  return instantFromLocalDate(addDays(from, days), 0, policy.timeZone);
}

/** Paid, still inside the grace window, or past it. */
type MonthVerdict = "paid" | "within-grace" | "blocked";

interface VerdictInput extends DeadlineInput {
  /** Missing means unpaid. A month record that is not there is never a yes. */
  paid?: boolean | null;
  now: Date;
}

/**
 * Whether this month admits the member right now.
 *
 * A missing month record counts as unpaid, deliberately: the tracker is
 * something an owner ticks by hand, and a gap in it must never read as a yes.
 */
export function monthVerdict(input: VerdictInput): MonthVerdict {
  if (input.paid === true) return "paid";
  return input.now.getTime() < payDeadline(input).getTime()
    ? "within-grace"
    : "blocked";
}

/** The deadline written the way both clients say it. */
export function formatDeadline(deadline: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(deadline);
}

/** The month written the way both clients say it. */
export function formatMonth(month: MonthKey, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}T12:00:00Z`));
}

export interface MembershipWarning {
  verdict: MonthVerdict;
  /** One line saying where they stand. */
  headline: string;
  /** One line saying what happens next, and when. */
  detail: string;
}

/**
 * What to tell a member about an unpaid month, in words both clients share.
 *
 * Returns null for a paid month: there is nothing to say, and a green tick for
 * every settled month is noise. A blocked month still gets a message rather
 * than silence, because "you cannot book" without a reason is worse than the
 * bad news itself.
 *
 * The deadline is the first moment that is too late, so the text names the day
 * access STOPS. Saying "you have until the 7th" and meaning "until the 8th at
 * 00:00" is the kind of off-by-one that costs somebody a session.
 */
export function membershipWarning(input: {
  verdict: MonthVerdict;
  month: MonthKey;
  deadline: Date;
  planName: string;
  timeZone: string;
}): MembershipWarning | null {
  const { verdict, month, deadline, planName, timeZone } = input;
  if (verdict === "paid") return null;

  const when = formatDeadline(deadline, timeZone);
  const which = formatMonth(month, timeZone);
  if (verdict === "within-grace") {
    return {
      verdict,
      headline: `${which} is not paid yet on ${planName}.`,
      detail: `You can still book and train until ${when}. After that, booking stops and any classes you have booked are cancelled.`,
    };
  }
  return {
    verdict,
    headline: `${which} is unpaid on ${planName}.`,
    detail: `Booking is closed since ${when}. Pay at the desk and your gym will tick the month, which opens it again.`,
  };
}
