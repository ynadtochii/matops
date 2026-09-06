import type { MoneyAmount } from "./referrals";
import { onSameLocalDay } from "./calendar";
import { DAY_MS } from "./local-date";
import { isPendingCoach } from "./membership";
import { groupMoneyByCurrency } from "./referrals";

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

/**
 * One academy, as the organization overview sees it (ADR 124). Small on
 * purpose: an owner opening the overview wants to know where the work is, not
 * to read every mat's dashboard at once. Decision 14 says each entity is read
 * in its own exact scope and combined on the server, so this is the shape that
 * crosses that boundary.
 *
 * `memberUserIds` is here rather than a bare count because one person can train
 * at two mats and must count once in the organization total.
 */
export interface EntitySummary {
  entityId: string;
  name: string;
  timeZone: string;
  memberUserIds: string[];
  pendingMembers: number;
  newLeads: number;
  openClaims: number;
  upcomingClasses: number;
  revenue: MoneyAmount[];
}

export interface OrganizationSummary {
  members: number;
  pendingMembers: number;
  newLeads: number;
  openClaims: number;
  upcomingClasses: number;
  revenue: MoneyAmount[];
  entities: EntitySummary[];
}

/**
 * Organization totals from the per-entity reads. Members are deduplicated by
 * user id; money is grouped by currency and never summed across them, the same
 * rule the referral ledger follows.
 */
export function combineEntitySummaries(
  rows: readonly EntitySummary[],
): OrganizationSummary {
  const people = new Set<string>();
  for (const row of rows) for (const id of row.memberUserIds) people.add(id);
  const sum = (pick: (r: EntitySummary) => number) =>
    rows.reduce((n, r) => n + pick(r), 0);

  return {
    members: people.size,
    pendingMembers: sum((r) => r.pendingMembers),
    newLeads: sum((r) => r.newLeads),
    openClaims: sum((r) => r.openClaims),
    upcomingClasses: sum((r) => r.upcomingClasses),
    revenue: groupMoneyByCurrency(rows.flatMap((r) => r.revenue)),
    entities: [...rows],
  };
}
