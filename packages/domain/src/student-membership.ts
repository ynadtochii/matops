import type { Money } from "./plan-price";
import { formatDeadline } from "./membership-month";

export interface PlanOffer {
  id: string;
  archived: boolean;
  staffOnly: boolean;
  entityIds: string[];
  amount: Money | null;
  cardLink: boolean;
  waysToPay: number;
}

export function choosablePlans<T extends PlanOffer>(
  plans: readonly T[],
  input: { entityId: string },
): T[] {
  return plans
    .filter(
      (p) =>
        !p.archived &&
        !p.staffOnly &&
        p.entityIds.includes(input.entityId) &&
        p.amount !== null &&
        p.amount.priceMinor > 0 &&
        (p.cardLink || p.waysToPay > 0),
    )
    .sort(
      (a, b) =>
        (a.amount?.priceMinor ?? 0) - (b.amount?.priceMinor ?? 0) ||
        a.id.localeCompare(b.id),
    );
}

export interface BannerMembership {
  assignmentId: string;
  planName: string;
  status: string;
  covers: boolean;
  paymentRequired: boolean;
  paymentStatus: "unpaid" | "reported" | "confirmed" | "rejected";
  held: boolean;
  awaitingStaff: boolean;
  firstMonth: boolean;
  deadline: Date;
}

export type MembershipBanner =
  | { kind: "choose_plan" }
  | { kind: "no_plans" }
  | { kind: "finish_payment"; planName: string; assignmentId: string }
  | { kind: "waiting_check"; planName: string }
  | { kind: "waiting_cash"; planName: string }
  | { kind: "rejected"; planName: string }
  | {
      kind: "renew_due";
      planName: string;
      assignmentId: string;
      deadline: Date;
    }
  | { kind: "renew_overdue"; planName: string; assignmentId: string };

export function membershipBanner(input: {
  paymentsOn: boolean;
  activeStudent: boolean;
  memberships: readonly BannerMembership[];
  choosable: number;
  now: Date;
}): MembershipBanner | null {
  if (!input.paymentsOn || !input.activeStudent) return null;
  const covering = input.memberships.filter(
    (m) => m.status === "active" && m.covers,
  );
  if (covering.length === 0) {
    return input.choosable > 0 ? { kind: "choose_plan" } : { kind: "no_plans" };
  }
  if (
    covering.some((m) => !m.paymentRequired || m.paymentStatus === "confirmed")
  ) {
    return null;
  }

  const declined = covering.find(
    (m) => m.held || m.paymentStatus === "rejected",
  );
  if (declined) return { kind: "rejected", planName: declined.planName };
  const checking = covering.find(
    (m) => m.paymentStatus === "reported" && !m.awaitingStaff,
  );
  if (checking) return { kind: "waiting_check", planName: checking.planName };
  const cash = covering.find((m) => m.paymentStatus === "reported");
  if (cash) return { kind: "waiting_cash", planName: cash.planName };

  const due = covering.find((m) => input.now.getTime() < m.deadline.getTime());
  if (due) {
    return {
      kind: "renew_due",
      planName: due.planName,
      assignmentId: due.assignmentId,
      deadline: due.deadline,
    };
  }
  const [unpaid] = covering;
  if (!unpaid) return null;
  return unpaid.firstMonth
    ? {
        kind: "finish_payment",
        planName: unpaid.planName,
        assignmentId: unpaid.assignmentId,
      }
    : {
        kind: "renew_overdue",
        planName: unpaid.planName,
        assignmentId: unpaid.assignmentId,
      };
}

export function canSwapChosenPlan(input: {
  chosenBySelf: boolean;
  firstMonth: boolean;
  paymentStatus: "unpaid" | "reported" | "confirmed" | "rejected";
  held: boolean;
}): boolean {
  return (
    input.chosenBySelf &&
    input.firstMonth &&
    input.paymentStatus === "unpaid" &&
    !input.held
  );
}

export const CASH_PAID_ON_MAX_DAYS = 62;

export function cashPaidOnEarliest(today: string): string {
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - CASH_PAID_ON_MAX_DAYS);
  return day.toISOString().slice(0, 10);
}

export function cashPaidOnProblem(
  paidOn: string,
  today: string,
): "future" | "too_old" | null {
  if (paidOn > today) return "future";
  const days =
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${paidOn}T00:00:00Z`)) /
    86_400_000;
  return days > CASH_PAID_ON_MAX_DAYS ? "too_old" : null;
}

export interface MembershipBannerText {
  text: string;
  blocking: boolean;
  action: string | null;
}

export function membershipBannerText(
  banner: MembershipBanner,
  timeZone: string,
): MembershipBannerText {
  switch (banner.kind) {
    case "choose_plan":
      return {
        text: "Choose a membership to book classes.",
        blocking: true,
        action: "Choose a plan",
      };
    case "no_plans":
      return {
        text: "Your gym has not set up memberships yet, so booking is closed. Ask the gym.",
        blocking: true,
        action: null,
      };
    case "finish_payment":
      return {
        text: `Finish paying for ${banner.planName} to book classes.`,
        blocking: true,
        action: "Pay now",
      };
    case "waiting_check":
      return {
        text: `Your gym is checking your payment for ${banner.planName}. You can book meanwhile.`,
        blocking: false,
        action: null,
      };
    case "waiting_cash":
      return {
        text: `Waiting for your gym to confirm your cash payment for ${banner.planName}. Booking opens once they do.`,
        blocking: true,
        action: null,
      };
    case "rejected":
      return {
        text: `Your payment for ${banner.planName} was not accepted. Contact your gym.`,
        blocking: true,
        action: null,
      };
    case "renew_due":
      return {
        text: `Pay for ${banner.planName} before ${formatDeadline(banner.deadline, timeZone)} to keep booking.`,
        blocking: false,
        action: "Pay now",
      };
    case "renew_overdue":
      return {
        text: `Pay for ${banner.planName} to book classes again.`,
        blocking: true,
        action: "Pay now",
      };
  }
}
