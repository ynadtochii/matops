import { onSameLocalDay } from "./calendar";
import { DAY_MS } from "./local-date";
import { isPendingCoach } from "./membership";

export interface DashClass {
  startsAt: Date;
  durationMinutes: number;
  status: string;
}

export function classEndsAt(c: {
  startsAt: Date;
  durationMinutes: number;
}): number {
  return c.startsAt.getTime() + c.durationMinutes * 60 * 1000;
}

export interface DayPlan<T> {
  list: T[];
  showTomorrow: boolean;
  nowIndex: number | null;
}

export function dayPlan<T extends DashClass>(
  rows: T[],
  today: Date,
  tomorrow: Date,
  now: Date,
): DayPlan<T> {
  const onDay = (d: Date) =>
    rows
      .filter((r) => r.status !== "cancelled" && onSameLocalDay(r.startsAt, d))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const todays = onDay(today);
  const tomorrows = onDay(tomorrow);
  const showTomorrow =
    todays.every((r) => classEndsAt(r) <= now.getTime()) &&
    tomorrows.length > 0;
  const list = showTomorrow ? tomorrows : todays;
  return {
    list,
    showTomorrow,
    // The list is sorted, so the count of already-started classes IS the index
    // the now-line belongs at. Tomorrow has no "now".
    nowIndex: showTomorrow
      ? null
      : list.filter((r) => r.startsAt.getTime() <= now.getTime()).length,
  };
}

export interface DashMember {
  status: string;
  invitedRole?: string | null;
  dues?: { status: string } | null;
}

export interface RosterSummary<T> {
  pendingStudents: number;
  pendingCoaches: number;
  active: number;
  overdue: T[];
}

export function rosterSummary<T extends DashMember>(
  members: T[],
): RosterSummary<T> {
  const pendingCoaches = members.filter(isPendingCoach).length;
  return {
    pendingCoaches,
    pendingStudents:
      members.filter((m) => m.status === "pending").length - pendingCoaches,
    active: members.filter((m) => m.status === "active").length,
    overdue: members.filter((m) => m.dues?.status === "overdue"),
  };
}

export function upcomingClassCount(rows: DashClass[], from: Date): number {
  return rows.filter(
    (r) => r.status !== "cancelled" && r.startsAt.getTime() >= from.getTime(),
  ).length;
}

// Last week's leads only: `drop_in` has no handled flag, so an all-time count
// could never reach zero and the queue would read as permanently dirty.
export function newLeadCount(
  leads: { lastVisitAt: Date }[],
  since: Date,
): number {
  return leads.filter((l) => l.lastVisitAt.getTime() >= since.getTime()).length;
}

export function isFirstRun(
  activeMembers: number,
  upcomingClasses: number,
): boolean {
  return activeMembers === 0 && upcomingClasses === 0;
}

export function daysSince(when: Date | null, now: Date): number | null {
  if (!when) return null;
  return Math.floor((now.getTime() - when.getTime()) / DAY_MS);
}
