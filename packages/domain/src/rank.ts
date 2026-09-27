/**
 * @matops/domain/rank — member rank / belt systems (v1.4, ADR 41).
 * PURE — no I/O, no DB, no clock. The single source of truth for what a rank IS
 * per discipline, behind the owner set/promote control (G.2) and the student's
 * read-only rank + timeline (G.3).
 *
 * Rank is a JUDGMENT the coach records, never a computation — there is NO
 * attendance→promotion automation and NO progress prediction (deliberately: BJJ
 * grading is instructor-controlled and not earned by class count; ADR 41).
 *
 * A member holds zero or more ranks, ONE per discipline. Rank is stored as
 * data (a discipline key + a belt value + a stripe count), never a hard enum, so
 * a new discipline is additive config, not a refactor. The first release seeds
 * BJJ only; owner-defined disciplines and ladders stay parked.
 */

/** A discipline's ordered belt ladder + its sub-level (stripe/degree) rule. */
interface RankSystem {
  /** The discipline key (matches the class `discipline` tag where it overlaps). */
  discipline: string;
  /** Human label for the discipline, e.g. "Brazilian Jiu-Jitsu". */
  label: string;
  /** Belt levels, lowest → highest. Order is meaningful (the ladder). */
  belts: string[];
  /**
   * Highest sub-level a belt can carry (BJJ stripes 0–4). `0` = this system has
   * no sub-levels (belt colour only), so the UI hides stripes.
   */
  maxStripes: number;
  /** Singular unit label for the sub-level, e.g. "stripe". */
  stripeUnit: string;
}

/**
 * The seeded rank systems. The first release has BJJ only. Add a key here to
 * support another belted art: no schema or code change needed. A discipline
 * absent from this map has no rank control, and its stored ranks still display
 * with the raw key as the label.
 */
export const RANK_SYSTEMS: Record<string, RankSystem> = {
  bjj: {
    discipline: "bjj",
    label: "Brazilian Jiu-Jitsu",
    belts: ["White", "Blue", "Purple", "Brown", "Black"],
    maxStripes: 4,
    stripeUnit: "stripe",
  },
};

/** The disciplines that have a rank system — populates the owner's discipline picker. */
export function rankDisciplines(): RankSystem[] {
  return Object.values(RANK_SYSTEMS);
}

/**
 * Is `(discipline, belt, stripes)` a rank that exists in the seeded system?
 * Guards the owner set/promote mutation (G.2): the belt must be a known level of
 * that discipline and the stripe count within its range. Rejects unknown
 * disciplines (no system) and out-of-range stripes.
 */
export function isValidRank(
  discipline: string,
  belt: string,
  stripes: number,
): boolean {
  const system = RANK_SYSTEMS[discipline];
  if (!system) return false;
  if (!Number.isInteger(stripes)) return false;
  if (stripes < 0 || stripes > system.maxStripes) return false;
  return system.belts.includes(belt);
}

/** A member's rank in one discipline — the shape stored + displayed. */
interface RankEntry {
  discipline: string;
  belt: string;
  stripes: number;
}

/**
 * The display string for a rank, e.g. `"Blue · 2 stripes"`, `"Blue · 1 stripe"`,
 * or just `"Black"` when there are no stripes (0, or a no-stripe system).
 * Used on the owner panel and the student profile so both read the same.
 */
export function formatRank(entry: RankEntry): string {
  const system = RANK_SYSTEMS[entry.discipline];
  const unit = system?.stripeUnit ?? "stripe";
  if (!system || system.maxStripes === 0 || entry.stripes <= 0) {
    return entry.belt;
  }
  const plural = entry.stripes === 1 ? unit : `${unit}s`;
  return `${entry.belt} · ${entry.stripes} ${plural}`;
}

/** The discipline's human label, or the raw key if it has no seeded system. */
export function disciplineLabel(discipline: string): string {
  return RANK_SYSTEMS[discipline]?.label ?? discipline;
}

/**
 * Is moving from `current` to `next` an actual change worth recording as a
 * promotion? True when there is no current rank, or the belt or stripe count
 * differs. Keeps "what counts as a promotion" in one pure place (the router
 * appends history only when this is true).
 */
export function isRankChange(
  current: { belt: string; stripes: number } | null,
  next: { belt: string; stripes: number },
): boolean {
  if (!current) return true;
  return current.belt !== next.belt || current.stripes !== next.stripes;
}

/**
 * Order of two ranks in the same discipline's ladder. Returns a negative number
 * when `a` sits BELOW `b`, `0` when they are the same level, a positive number
 * when `a` sits ABOVE `b`. Belt position in the ladder dominates; the stripe
 * count only breaks a tie within one belt (so White · 4 stripes is still below
 * Blue · 0). A belt not in the ladder sorts as index `-1` (below every real
 * belt), so a retired belt never blocks a fresh, valid one.
 */
export function compareRank(
  discipline: string,
  a: { belt: string; stripes: number },
  b: { belt: string; stripes: number },
): number {
  const system = RANK_SYSTEMS[discipline];
  const ai = system ? system.belts.indexOf(a.belt) : -1;
  const bi = system ? system.belts.indexOf(b.belt) : -1;
  if (ai !== bi) return ai - bi;
  return a.stripes - b.stripes;
}

/**
 * Is setting `next` a REGRESSION from `current` — a demotion the owner control
 * must refuse? Rank only ever goes up (ADR 41): a belt or stripe count may be
 * bumped, never lowered. True only when there IS a current rank AND `next` sits
 * strictly below it in the ladder. No current rank, an equal rank, or any
 * promotion returns false. (A genuine mistake is undone with the clear control,
 * not by demoting — clearing drops `current`, so the next set is unconstrained.)
 */
export function isRankRegression(
  discipline: string,
  current: { belt: string; stripes: number } | null,
  next: { belt: string; stripes: number },
): boolean {
  if (!current) return false;
  return compareRank(discipline, next, current) < 0;
}
