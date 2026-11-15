import type { PeriodSchedule } from "./membership-period";
import { appliesInMonth } from "./access-plan";
import { instantFromLocalDate, localDateISO } from "./materialize";
import {
  addDays,
  isJoinPeriod,
  periodLabel,
  periodsFrom,
} from "./membership-period";
import { MAX_UPFRONT_MONTHS } from "./upfront";

/**
 * Membership periods and their pay deadlines (ADR 126, ADR 163). Pure — no
 * clock reading, no I/O. Every instant here is computed in the ORGANIZATION's
 * own calendar time zone, so one shared membership expires at the same moment
 * at every branch it covers.
 *
 * A "month" key is the start date of one rolling period (`membership-period`).
 * Memberships anchored on the 1st still run first to first.
 */

/**
 * Days a new member gets to pay their first period, counted from the day they
 * joined. Separate from the owner's `graceDays`, which is how late an existing
 * member may renew.
 */
export const JOIN_GRACE_DAYS = 3;

export interface MembershipPolicy {
  /** Days after a period starts that it still admits while unpaid. */
  graceDays: number;
  /** IANA zone the organization counts its months in. */
  timeZone: string;
}

/** The start date of one membership period (ADR 163): "2026-09-15". */
export type MonthKey = string;

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

interface DeadlineInput {
  /** The period being paid for: its start date. */
  month: MonthKey;
  /** The membership's anchor, `access_assignment.start_month`. */
  startMonth: MonthKey;
  /** The day they joined, `access_assignment.starts_on`. */
  joinedOn?: string | null;
  policy: MembershipPolicy;
}

/**
 * The moment access stops if this period goes unpaid: the first moment that is
 * too late, so a comparison is a plain `now < deadline`.
 *
 * The first period of a new membership: the join day plus
 * {@link JOIN_GRACE_DAYS}. Every other period: its start plus the owner's grace
 * days. Days are added on the calendar and converted afterwards, so a
 * daylight-saving change moves the wall clock, not the boundary.
 */
export function payDeadline(input: DeadlineInput): Date {
  const { month, startMonth, joinedOn, policy } = input;
  const join = isJoinPeriod(month, {
    startMonth,
    startsOn: joinedOn ?? null,
  });
  const from = join && joinedOn ? joinedOn : month;
  const days = join ? JOIN_GRACE_DAYS : policy.graceDays;
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
  periodLabel: string;
  deadline: Date;
  planName: string;
  timeZone: string;
}): MembershipWarning | null {
  const { verdict, periodLabel, deadline, planName, timeZone } = input;
  if (verdict === "paid") return null;

  const when = formatDeadline(deadline, timeZone);
  if (verdict === "within-grace") {
    return {
      verdict,
      headline: `${periodLabel} is not paid yet on ${planName}.`,
      detail: `You can still book and train until ${when}. After that, booking stops and any classes you have booked are cancelled.`,
    };
  }
  return {
    verdict,
    headline: `${periodLabel} is unpaid on ${planName}.`,
    detail: `Booking is closed since ${when}. Pay from Membership to open it again.`,
  };
}

export interface DueDate {
  month: MonthKey;
  label: string;
  deadlineOn: string;
  deadlineMoved: boolean;
  paid: boolean;
}

// The current period and the next two, then on to the first unpaid one, so a
// member paid well ahead still shows when their next payment is due.
export function upcomingDueDates(input: {
  current: MonthKey;
  schedule: PeriodSchedule & { startsOn: string | null };
  recorded: readonly {
    month: MonthKey;
    status: string;
    deadline: Date | null;
  }[];
  policy: MembershipPolicy;
}): DueDate[] {
  const { current, schedule, recorded, policy } = input;
  const dates: DueDate[] = [];
  for (const month of periodsFrom(current, schedule, MAX_UPFRONT_MONTHS + 1)) {
    if (!appliesInMonth(schedule, month)) break;
    const record = recorded.find((m) => m.month === month);
    const paid = record?.status === "confirmed";
    const computed = payDeadline({
      month,
      startMonth: schedule.startMonth,
      joinedOn: schedule.startsOn,
      policy,
    });
    const deadline = record?.deadline ?? computed;
    dates.push({
      month,
      label: periodLabel(month, schedule),
      deadlineOn: localDateISO(deadline, policy.timeZone),
      deadlineMoved:
        record?.deadline != null &&
        record.deadline.getTime() !== computed.getTime(),
      paid,
    });
    if (dates.length >= 3 && !paid) break;
  }
  return dates;
}
