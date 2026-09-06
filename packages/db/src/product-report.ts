import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";

import type { DbReader } from "./tenant";
import { productEvent } from "./product-event-schema";

export const STUDENT_ACTIVITY = ["student_booking", "student_attendance"];

export interface WeeklyUseRow {
  weekStart: string;
  activeOrganizations: number;
  bookingOrganizations: number;
  attendanceOrganizations: number;
  events: number;
}

export async function weeklyRetainedUse(
  since: Date,
  exec: DbReader,
): Promise<WeeklyUseRow[]> {
  const weekStart = sql<string>`date_trunc('week', ${productEvent.occurredAt})::date`;
  const orgs = sql`count(distinct ${productEvent.organizationId})`;
  return exec
    .select({
      weekStart,
      activeOrganizations: sql<number>`${orgs}::int`,
      bookingOrganizations: sql<number>`(${orgs} filter (where ${productEvent.name} = 'student_booking'))::int`,
      attendanceOrganizations: sql<number>`(${orgs} filter (where ${productEvent.name} = 'student_attendance'))::int`,
      events: sql<number>`count(*)::int`,
    })
    .from(productEvent)
    .where(
      and(
        eq(productEvent.kind, "activity"),
        inArray(productEvent.name, STUDENT_ACTIVITY),
        gte(productEvent.occurredAt, since),
      ),
    )
    .groupBy(weekStart)
    .orderBy(weekStart);
}

export function weeksBack(weeks: number, now: Date): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const monday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - monday - (weeks - 1) * 7);
  return start;
}

export interface MilestoneRow {
  organizationId: string;
  created: Date | null;
  firstBranch: Date | null;
  firstSchedule: Date | null;
  firstStudent: Date | null;
  firstBooking: Date | null;
  firstPlan: Date | null;
  firstAssignment: Date | null;
  secondBranch: Date | null;
  branchActivated: Date | null;
  paidCommitment: Date | null;
}

const SETUP_STEPS: (keyof MilestoneRow)[] = [
  "firstBranch",
  "firstSchedule",
  "firstStudent",
  "firstPlan",
  "firstAssignment",
];

function firstOf(name: string) {
  return sql<Date | null>`min(${productEvent.occurredAt}) filter (where ${productEvent.name} = ${name})`;
}

export function organizationMilestones(
  exec: DbReader,
): Promise<MilestoneRow[]> {
  return exec
    .select({
      organizationId: productEvent.organizationId,
      created: firstOf("organization_created"),
      firstBranch: firstOf("first_branch"),
      firstSchedule: firstOf("first_schedule"),
      firstStudent: firstOf("first_student"),
      firstBooking: firstOf("first_booking"),
      firstPlan: firstOf("first_plan"),
      firstAssignment: firstOf("first_assignment"),
      secondBranch: firstOf("second_branch"),
      branchActivated: firstOf("branch_activated"),
      paidCommitment: firstOf("paid_commitment"),
    })
    .from(productEvent)
    .where(eq(productEvent.kind, "milestone"))
    .groupBy(productEvent.organizationId);
}

export interface FunnelSummary {
  gyms: number;
  reached: Record<string, number>;
  setupComplete: number;
  medianDaysToSchedule: number | null;
  medianDaysToFirstBooking: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 1
      ? sorted[mid]
      : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return Math.round((value ?? 0) * 10) / 10;
}

function elapsed(rows: MilestoneRow[], step: keyof MilestoneRow): number[] {
  const days: number[] = [];
  for (const row of rows) {
    const reached = row[step];
    if (row.created && reached instanceof Date)
      days.push(daysBetween(row.created, reached));
  }
  return days;
}

export function funnelSummary(rows: MilestoneRow[]): FunnelSummary {
  const steps: (keyof MilestoneRow)[] = [
    "firstBranch",
    "firstSchedule",
    "firstStudent",
    "firstBooking",
    "firstPlan",
    "firstAssignment",
    "secondBranch",
    "branchActivated",
    "paidCommitment",
  ];
  const reached: Record<string, number> = {};
  for (const step of steps) {
    reached[step] = rows.filter((r) => r[step] !== null).length;
  }
  return {
    gyms: rows.length,
    reached,
    setupComplete: rows.filter((r) => SETUP_STEPS.every((s) => r[s] !== null))
      .length,
    medianDaysToSchedule: median(elapsed(rows, "firstSchedule")),
    medianDaysToFirstBooking: median(elapsed(rows, "firstBooking")),
  };
}

export async function weeklyTwoBranchUse(
  since: Date,
  exec: DbReader,
): Promise<{ weekStart: string; organizations: number }[]> {
  const perOrgWeek = exec
    .select({
      week: sql<string>`date_trunc('week', ${productEvent.occurredAt})::date`.as(
        "week",
      ),
      organizationId: productEvent.organizationId,
      branches: sql<number>`count(distinct ${productEvent.entityId})::int`.as(
        "branches",
      ),
    })
    .from(productEvent)
    .where(
      and(
        eq(productEvent.kind, "activity"),
        inArray(productEvent.name, STUDENT_ACTIVITY),
        gte(productEvent.occurredAt, since),
      ),
    )
    .groupBy(sql`1`, productEvent.organizationId)
    .as("per_org_week");

  return exec
    .select({
      weekStart: perOrgWeek.week,
      organizations: sql<number>`count(*) filter (where ${perOrgWeek.branches} >= 2)::int`,
    })
    .from(perOrgWeek)
    .groupBy(perOrgWeek.week)
    .orderBy(perOrgWeek.week);
}

export async function weekTwoBookers(exec: DbReader): Promise<number> {
  const created = exec
    .select({
      organizationId: productEvent.organizationId,
      at: sql<Date>`min(${productEvent.occurredAt})`.as("at"),
    })
    .from(productEvent)
    .where(eq(productEvent.name, "organization_created"))
    .groupBy(productEvent.organizationId)
    .as("created");

  const rows = await exec
    .select({
      n: sql<number>`count(distinct ${productEvent.organizationId})::int`,
    })
    .from(productEvent)
    .innerJoin(created, eq(created.organizationId, productEvent.organizationId))
    .where(
      and(
        eq(productEvent.name, "student_booking"),
        gte(productEvent.occurredAt, sql`${created.at} + interval '7 days'`),
        lt(productEvent.occurredAt, sql`${created.at} + interval '14 days'`),
      ),
    );
  return rows[0]?.n ?? 0;
}

export async function weeklyOwnerOnly(
  since: Date,
  exec: DbReader,
): Promise<{ weekStart: string; organizations: number }[]> {
  const perOrgWeek = exec
    .select({
      week: sql<string>`date_trunc('week', ${productEvent.occurredAt})::date`.as(
        "week",
      ),
      organizationId: productEvent.organizationId,
      staff:
        sql<number>`(count(*) filter (where ${productEvent.name} = 'staff_action'))::int`.as(
          "staff",
        ),
      students:
        sql<number>`(count(*) filter (where ${productEvent.name} in ('student_booking', 'student_attendance')))::int`.as(
          "students",
        ),
    })
    .from(productEvent)
    .where(
      and(
        eq(productEvent.kind, "activity"),
        gte(productEvent.occurredAt, since),
      ),
    )
    .groupBy(sql`1`, productEvent.organizationId)
    .as("per_org_week");

  return exec
    .select({
      weekStart: perOrgWeek.week,
      organizations: sql<number>`(count(*) filter (where ${perOrgWeek.staff} > 0 and ${perOrgWeek.students} = 0))::int`,
    })
    .from(perOrgWeek)
    .groupBy(perOrgWeek.week)
    .orderBy(perOrgWeek.week);
}
