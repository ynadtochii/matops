/**
 * What kinds of place an organization may run (ADR 124).
 *
 * The list is fixed in two places on purpose: here, and the `entity_type_supported`
 * check constraint on the table. Adding a type needs a migration to widen the
 * constraint, so the two cannot drift without someone noticing.
 */
export const ENTITY_TYPES = ["bjj_academy"] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export function isSupportedEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value);
}

/** True for the one type that gets the BJJ screens: schedule, roster, dues. */
export function isBjjAcademy(type: string): boolean {
  return type === "bjj_academy";
}
