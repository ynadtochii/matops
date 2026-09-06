/**
 * What a new gym still has to do (ADR 128, spec FP8).
 *
 * The rule is pure and the facts come from one server read, so the list an
 * owner sees is never a guess about what they have done. Each item is a real
 * piece of state, which is why nothing here can be ticked by hand: an item is
 * done because the gym holds the row, and it stops being done if that row goes.
 */
export interface SetupFacts {
  /** The gym has a name of its own, rather than the one it was born with. */
  gymNamed: boolean;
  branches: number;
  /** Branches whose place and time zone are both filled in. */
  branchesLocated: number;
  /** Branches with at least one active recurring class or session. */
  branchesScheduled: number;
  instructors: number;
  bankDetails: boolean;
  plans: number;
  assignments: number;
  /** Active members no membership covers, across every branch. */
  uncoveredMembers: number;
  invites: number;
}

export type SetupKey =
  | "gym"
  | "branch"
  | "location"
  | "schedule"
  | "staff"
  | "bank"
  | "plan"
  | "assign"
  | "ready"
  | "invite";

export interface SetupItem {
  key: SetupKey;
  done: boolean;
  /** Blocked items are not the owner's next move: their turn comes later. */
  blocked: boolean;
}

/**
 * The list, in the order the work actually happens. Nothing after the first
 * branch can be done before it exists, and nothing about money can be done
 * before there is a plan, so those items report `blocked` rather than simply
 * not done: an owner reading a flat list of ten crosses cannot tell which one
 * to start.
 */
export function organizationSetup(facts: SetupFacts): SetupItem[] {
  const hasBranch = facts.branches > 0;
  const hasPlan = facts.plans > 0;

  return [
    { key: "gym", done: facts.gymNamed, blocked: false },
    { key: "branch", done: hasBranch, blocked: false },
    {
      key: "location",
      done: hasBranch && facts.branchesLocated === facts.branches,
      blocked: !hasBranch,
    },
    {
      key: "schedule",
      done: hasBranch && facts.branchesScheduled === facts.branches,
      blocked: !hasBranch,
    },
    { key: "staff", done: facts.instructors > 0, blocked: !hasBranch },
    { key: "bank", done: facts.bankDetails, blocked: false },
    { key: "plan", done: hasPlan, blocked: !hasBranch },
    { key: "assign", done: facts.assignments > 0, blocked: !hasPlan },
    {
      key: "ready",
      // Nobody covered is not readiness, it is an empty gym: this asks whether
      // the people who are here can train, so it needs an assignment first.
      done: facts.assignments > 0 && facts.uncoveredMembers === 0,
      blocked: facts.assignments === 0,
    },
    { key: "invite", done: facts.invites > 0, blocked: !hasBranch },
  ];
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
  staffed: boolean;
  /** The branch runs on shared memberships rather than legacy branch dues. */
  enforced: boolean;
  uncovered: number;
  /** A plan of this gym names this branch among the ones it covers. */
  planCovers: boolean;
  bjj: boolean;
  publicBookingEnabled: boolean;
  publicClasses: number;
}

export type BranchIssue =
  "schedule" | "staff" | "covered" | "membership" | "public";

/**
 * What stops a branch opening (spec FP8). Each one is a thing the owner can
 * fix, so an empty list means the branch is ready rather than merely quiet.
 *
 * The public-classes check fires only where the owner has TURNED public
 * booking ON and shared nothing, which is the state that misleads a visitor.
 * A gym that never wanted a public page is not missing anything, and flagging
 * it would nag every academy about a feature it declined.
 */
export function branchLaunchIssues(facts: BranchHealthFacts): BranchIssue[] {
  const issues: BranchIssue[] = [];
  if (!facts.scheduled) issues.push("schedule");
  if (!facts.staffed) issues.push("staff");
  if (facts.enforced && !facts.planCovers) issues.push("membership");
  if (facts.enforced && facts.uncovered > 0) issues.push("covered");
  if (facts.bjj && facts.publicBookingEnabled && facts.publicClasses === 0) {
    issues.push("public");
  }
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
