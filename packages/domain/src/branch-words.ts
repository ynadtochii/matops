import { isBjjAcademy } from "./entity";

/**
 * The words a branch is described in (spec FP9, ADR 128).
 *
 * A mat and a weight room are the same row in the database and two different
 * things to the person standing in one. This is the whole difference, kept in
 * one place so a screen picks the noun rather than inventing it, and so a third
 * branch type later changes one file instead of forty strings.
 *
 * Nothing here says "entity" or "organization": those are the database's words
 * (FP9).
 */
export interface BranchWords {
  /** What this place is: "academy" or "space". */
  branch: string;
  branchPlural: string;
  /** What one dated thing on its schedule is: "class" or "session". */
  session: string;
  sessionPlural: string;
}

const BJJ: BranchWords = {
  branch: "academy",
  branchPlural: "academies",
  session: "class",
  sessionPlural: "classes",
};

const GENERAL: BranchWords = {
  branch: "space",
  branchPlural: "spaces",
  session: "session",
  sessionPlural: "sessions",
};

export function branchWords(type: string): BranchWords {
  return isBjjAcademy(type) ? BJJ : GENERAL;
}

/** "Opening your academy" / "Opening your space", for a loading label. */
export function openingLabel(type: string): string {
  return `Opening your ${branchWords(type).branch}`;
}

/**
 * A sentence that starts with the count: "3 classes", "1 session".
 *
 * The count leads because that is what the reader is looking for, and the
 * singular is spelled rather than derived, since English plurals are not a
 * suffix rule and "classs" is the kind of thing nobody notices until a member
 * does.
 */
export function sessionCount(type: string, n: number): string {
  const words = branchWords(type);
  return `${n} ${n === 1 ? words.session : words.sessionPlural}`;
}

/** One of the links the share dialog can offer (spec FP9, ADR 128). */
export type ShareAction = "booking" | "checkin" | "join";

/**
 * Which links exist for a branch of this type.
 *
 * Joining works everywhere: every branch has a roster and somebody has to get
 * on it. The other two are BJJ promises. Trial booking hands a stranger a class
 * to pick, and the drop-in poster opens a lead record, neither of which a weight
 * room does. A general space must therefore not even ASK the server for its
 * public booking settings, so the caller reads this list before it queries.
 */
export function shareActions(type: string): ShareAction[] {
  return isBjjAcademy(type) ? ["booking", "checkin", "join"] : ["join"];
}
