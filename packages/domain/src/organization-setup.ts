/**
 * What a new gym still has to do (ADR 128, spec FP8).
 *
 * The rule is pure and the facts come from one server read, so the list an
 * owner sees is never a guess about what they have done. Each item is a real
 * piece of state, which is why nothing here can be ticked by hand: an item is
 * done because the gym holds the row, and it stops being done if that row goes.
 */
export interface SetupFacts {
  branches: number;
  /** Branches whose place and time zone are both filled in. */
  branchesLocated: number;
  /** Branches with at least one active recurring class or session. */
  branchesScheduled: number;
  invites: number;
  activeStudents: number;
  bookings: number;
  paymentsOn: boolean;
  bankDetails: boolean;
  paidPlans: number;
  plans: number;
  assignments: number;
  /** Active members no membership covers, across every branch. */
  uncoveredMembers: number;
}

export type SetupKey =
  | "branch"
  | "location"
  | "schedule"
  | "invite"
  | "approve"
  | "booking"
  | "plan"
  | "bank"
  | "assign"
  | "ready";

interface SetupItem {
  key: SetupKey;
  done: boolean;
  /** Blocked items are not the owner's next move: their turn comes later. */
  blocked: boolean;
}

/**
 * The list, in the order the work actually happens: an academy, its classes,
 * a student invited and approved, then a first booking. A teaching owner is
 * the staff, so there is no separate instructor step. Plan and payment steps
 * appear only while a branch requires payment to book.
 */
export function organizationSetup(facts: SetupFacts): SetupItem[] {
  const hasBranch = facts.branches > 0;
  const scheduled = hasBranch && facts.branchesScheduled === facts.branches;
  const hasPlan = facts.plans > 0;

  const items: SetupItem[] = [
    { key: "branch", done: hasBranch, blocked: false },
    {
      key: "location",
      done: hasBranch && facts.branchesLocated === facts.branches,
      blocked: !hasBranch,
    },
    { key: "schedule", done: scheduled, blocked: !hasBranch },
    { key: "invite", done: facts.invites > 0, blocked: !hasBranch },
    {
      key: "approve",
      done: facts.activeStudents > 0,
      blocked: !hasBranch,
    },
    {
      key: "booking",
      done: facts.bookings > 0,
      blocked: facts.activeStudents === 0 || facts.branchesScheduled === 0,
    },
  ];
  if (!facts.paymentsOn) return items;

  items.push({ key: "plan", done: hasPlan, blocked: !hasBranch });
  if (facts.paidPlans > 0) {
    items.push({ key: "bank", done: facts.bankDetails, blocked: false });
  }
  items.push(
    { key: "assign", done: facts.assignments > 0, blocked: !hasPlan },
    {
      key: "ready",
      done: facts.assignments > 0 && facts.uncoveredMembers === 0,
      blocked: facts.assignments === 0,
    },
  );
  return items;
}

/** How far along setup is, counting only what the owner can act on today. */
export function setupProgress(items: readonly SetupItem[]): {
  done: number;
  total: number;
  complete: boolean;
} {
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, complete: done === items.length };
}

export interface BranchHealthFacts {
  scheduled: boolean;
  /** Somebody active runs this branch: an owner who teaches counts. */
  staffed: boolean;
  enforced: boolean;
  uncovered: number;
  /** A plan of this gym names this branch among the ones it covers. */
  planCovers: boolean;
}

export type BranchIssue = "schedule" | "staff" | "covered" | "membership";

/**
 * What stops a branch opening (spec FP8). Each one is a thing the owner can
 * fix, so an empty list means the branch is ready rather than merely quiet.
 */
export function branchLaunchIssues(facts: BranchHealthFacts): BranchIssue[] {
  const issues: BranchIssue[] = [];
  if (!facts.scheduled) issues.push("schedule");
  // A solo owner who teaches their own classes IS the coach. Only a mat with
  // nobody running it is a warning (ADR 129).
  if (!facts.staffed) issues.push("staff");
  if (facts.enforced && !facts.planCovers) issues.push("membership");
  if (facts.enforced && facts.uncovered > 0) issues.push("covered");
  return issues;
}

/**
 * The email addresses in a pasted list (ADR 128, spec FP8).
 *
 * An owner pastes what their spreadsheet gives them, which is commas, or
 * newlines, or a column with quotes and a header. This takes the lot and
 * returns the addresses, lower-cased and deduplicated, rather than asking
 * anybody to reformat a file before they can use it.
 */
export function parseEmailList(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,;]+/)) {
    const value = raw
      .trim()
      .replace(/^["']|["']$/g, "")
      .toLowerCase();
    // A loose shape on purpose: the directory match below is the real check,
    // so this only has to drop headers and stray words.
    if (value.includes("@") && value.length > 2) seen.add(value);
  }
  return [...seen];
}

/**
 * Split a pasted list into people this gym knows and lines it does not.
 *
 * Matching by email against the directory is the whole check: somebody who
 * belongs to no branch cannot be given a membership anyway, so a name the gym
 * has never seen is reported back rather than half-accepted.
 */
export function matchPeopleByEmail(
  people: readonly { userId: string; email: string }[],
  emails: readonly string[],
): { matched: string[]; unmatched: string[] } {
  const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p.userId]));
  const matched: string[] = [];
  const unmatched: string[] = [];
  for (const email of emails) {
    const id = byEmail.get(email);
    if (id) matched.push(id);
    else unmatched.push(email);
  }
  return { matched, unmatched };
}
