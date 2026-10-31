import type { AssignmentStatus } from "./access-plan";

/**
 * May this person book or come in at this branch (ADR 126)? Pure — no clock
 * reading, no I/O; the caller says which moment it is asking about.
 *
 * ONE decision function for booking, admission, the member lists and the
 * owner's overview, so those four can never disagree about the same person.
 * Both clients render the same verdict, which is what keeps the web and the
 * app saying the same thing.
 */

export type AccessVerdict =
  | "ok"
  | "provisional"
  /** Nothing they hold covers this branch. */
  | "not-covered"
  /** They are covered, but their month ran out. */
  | "expired"
  /** The branch has not approved them yet. */
  | "pending-approval"
  | "payment-declined"
  | "awaiting-staff"
  /** The branch stopped them, whatever their memberships say. */
  | "suspended";

/** One membership, as it stands for the month being judged. */
export interface ApplicableAssignment {
  id: string;
  status: AssignmentStatus;
  /** The branches its plan covers. */
  entityIds: string[];
  /** Whether the month being judged is ticked paid. Missing means unpaid. */
  paid: boolean;
  paymentStatus?: "unpaid" | "reported" | "confirmed" | "rejected";
  held?: boolean;
  awaitingStaff?: boolean;
  paymentRequired?: boolean;
  /** The first moment that is too late for that month. */
  deadline: Date;
}

interface AccessInput {
  /** The branch being asked about. */
  entityId: string;
  /** Their standing AT that branch, or null for an owner who holds none. */
  membership: { status: string } | null;
  assignments: ApplicableAssignment[];
  /** The moment in question: now for a booking, the start for a session. */
  at: Date;
}

/** A membership admits when its month is paid, or the deadline has not passed. */
function admits(assignment: ApplicableAssignment, at: Date): boolean {
  return (
    assignment.paymentRequired === false ||
    assignment.paymentStatus === "confirmed" ||
    (assignment.paymentStatus === "reported" && !assignment.awaitingStaff) ||
    (assignment.paymentStatus === undefined && assignment.paid) ||
    at.getTime() < assignment.deadline.getTime()
  );
}

/** The active memberships whose plan names this branch. */
export function coveringAssignments(
  input: Pick<AccessInput, "entityId" | "assignments">,
): ApplicableAssignment[] {
  return input.assignments.filter(
    (a) => a.status === "active" && a.entityIds.includes(input.entityId),
  );
}

/**
 * The verdict, in the order the rules actually override each other.
 *
 * The BRANCH decides first. A suspension there denies booking however good the
 * membership is, because it is the mat saying no to this person, and payment
 * grace is a payment allowance rather than a way past a person's suspension.
 * Pending approval comes next for the same reason: they have not been let in
 * yet, and telling them their membership is fine would be the wrong sentence.
 *
 * Then coverage, as the UNION of active memberships. Two valid memberships
 * combine, and an expired third one takes nothing away: `ok` needs only one
 * that admits. `expired` is reserved for the case where something DOES cover
 * this branch and every one of them has run out, because "your month ran out"
 * and "you never had this branch" need different answers from the desk.
 */
export function membershipAccess(input: AccessInput): AccessVerdict {
  const status = input.membership?.status;
  if (status !== undefined && status !== "active" && status !== "pending") {
    return "suspended";
  }
  if (status === "pending") return "pending-approval";

  const covering = coveringAssignments(input);
  if (covering.length === 0) return "not-covered";
  if (
    covering.some(
      (assignment) =>
        assignment.held === true || assignment.paymentStatus === "rejected",
    )
  ) {
    return "payment-declined";
  }
  if (
    covering.some(
      (assignment) =>
        assignment.paymentStatus === "reported" && !assignment.awaitingStaff,
    )
  ) {
    return "provisional";
  }
  if (covering.some((a) => admits(a, input.at))) return "ok";
  return covering.some((a) => a.paymentStatus === "reported" && a.awaitingStaff)
    ? "awaiting-staff"
    : "expired";
}

/** Does this verdict let them book and come in? */
export function accessAdmits(verdict: AccessVerdict): boolean {
  return verdict === "ok" || verdict === "provisional";
}

/** The fallback when a gate says locked without naming a reason. */
export const BOOKING_LOCKED = "Booking is closed for you. Ask your gym why.";

/** What to tell someone, in the words both clients use. */
export function accessReason(
  verdict: AccessVerdict,
  branchName: string,
): string {
  switch (verdict) {
    case "ok":
      return "";
    case "provisional":
      return "Payment reported. You can book while the gym checks your payment. If payment is declined, booking and check-in access will pause.";
    case "expired":
      return "You haven't paid for this month yet, so booking is closed. Pay at the desk and your gym will open it again.";
    case "pending-approval":
      return `${branchName} has not approved you yet. You can browse classes while you wait.`;
    case "payment-declined":
      return `Your payment for ${branchName} was declined. An owner must approve it before you can book or check in.`;
    case "awaiting-staff":
      return `${branchName} still needs to confirm your cash payment. You can book once they do.`;
    case "suspended":
      return `Your place at ${branchName} is paused. Ask the gym to restore it.`;
    case "not-covered":
      return `Choose a membership to book classes at ${branchName}.`;
  }
}
