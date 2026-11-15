import type { PeriodSchedule } from "./membership-period";
import { periodStart } from "./membership-period";

export function claimStartDay(claim: {
  cashPaidOn: string | null;
  reportedOn: string;
}): string {
  return claim.cashPaidOn ?? claim.reportedOn;
}

export function canMoveClaimStart(input: {
  claimFirstMonth: string;
  schedule: PeriodSchedule;
  anyConfirmed: boolean;
}): boolean {
  return (
    input.claimFirstMonth === input.schedule.startMonth &&
    input.schedule.periodAnchor === null &&
    !input.anyConfirmed
  );
}

export type ClaimStartProblem = "after_today" | "too_early";

export function claimStartProblem(input: {
  startsOn: string;
  today: string;
  reportedOn: string;
}): ClaimStartProblem | null {
  if (input.startsOn > input.today) return "after_today";
  if (input.startsOn < periodStart(input.reportedOn, -1)) return "too_early";
  return null;
}
