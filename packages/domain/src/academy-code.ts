/**
 * Numeric academy code — the plain 6-digit number an owner shares so a student
 * can find and join the gym in the mobile app (docs/issues/32).
 *
 * For mobile v1 this is the ONLY way to join from the phone: the student types
 * the number, we look the academy up, they confirm and join. The custom-scheme
 * deep link + per-role invite links (docs/issues/31, 28) stay on the web and
 * return to mobile in a later iteration. Pure helpers only — the code generator
 * and the lookup live in @matops/db.
 */

/** A code is exactly this many digits. Fixed length keeps validation trivial. */
export const ACADEMY_CODE_LENGTH = 6;

/**
 * The role a code-based join always grants at approval. The Expo app is the
 * student app, so everyone who joins by code is a student — there is no per-role
 * choice on mobile (that is what the web invite links are for). Kept here as the
 * single source of truth for both the API and the tests (docs/issues/32).
 */
export const CODE_JOIN_ROLE = "student";

/** Strip surrounding whitespace so a code typed with stray spaces still matches.
 * Inner characters are left as-is — a non-digit still fails validation below. */
export function normalizeAcademyCode(raw: string): string {
  return raw.trim();
}

/** True only for exactly ACADEMY_CODE_LENGTH digits (0-9), nothing else. */
export function isValidAcademyCode(code: string): boolean {
  return code.length === ACADEMY_CODE_LENGTH && /^\d+$/.test(code);
}
