import type { Membership } from "./access";
import { isOwner, isStaff } from "./access";

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

/**
 * Where an entity's screens live. The prefix is a locked part of the pivot:
 * a URL that names its academy is what makes two browser tabs, a reload and a
 * shared link all land in the same place (ADR 124).
 */
export const ENTITY_PREFIX = "/entities";

function entitySegment(pathname: string): string | null {
  const match = /^\/entities\/([^/?#]+)/.exec(pathname);
  return match?.[1] ?? null;
}

export function entityFromPath(pathname: string): string | null {
  const raw = entitySegment(pathname);
  if (raw === null) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** The path an entity screen is reached at: `entityHref("a", "/members")`. */
export function entityHref(entityId: string, path = "/"): string {
  const base = `${ENTITY_PREFIX}/${encodeURIComponent(entityId)}`;
  return path === "/" ? base : `${base}${path}`;
}

/**
 * The part of the URL the route table reads: `/entities/a/members` is
 * `/members`, and the entity's own home page is `/`. A path outside the prefix
 * comes back unchanged, so `/overview` and `/profile` still match themselves.
 */
export function pathWithinEntity(pathname: string): string {
  const segment = entitySegment(pathname);
  if (segment === null) return pathname;
  const rest = pathname.slice(`${ENTITY_PREFIX}/`.length + segment.length);
  return rest === "" ? "/" : rest;
}

/**
 * Which screens of one entity need more than membership. One table, read by
 * both the sidebar (what to show) and the shell (what to render), so the nav
 * and the guard cannot disagree. Paths are entity-relative: `/members` is
 * `/entities/<id>/members`, and the entity's own home page is `/`. Anything
 * absent is open to every member: the home page, `/payments`, `/profile`,
 * `/training` and `/class/<id>` all branch by role inside the screen instead
 * (ADR 73). `/members` is staff so the head coach can approve and rank; the
 * owner-only blocks inside it branch on `isOwner` in the screen (ADR 75).
 *
 * `/overview` and the top-level `/profile` are NOT here. They belong to the
 * organization, not to a place, and are gated by the procedure they read:
 * `entity.list` refuses anyone who is not an organization member and lists only
 * the entities the caller may open (ADR 124).
 *
 * This is convenience, not security. The tRPC tier is the real guard
 * (`packages/api/src/trpc.ts`); this only decides what a person is offered.
 */
const ROUTE_ACCESS: { prefix: string; allowed: (m: Membership) => boolean }[] =
  [
    { prefix: "/members", allowed: isStaff },
    { prefix: "/referrals", allowed: isOwner },
    { prefix: "/settings", allowed: isOwner },
    { prefix: "/schedule", allowed: isStaff },
    { prefix: "/coaches", allowed: isStaff },
    { prefix: "/attendance", allowed: isStaff },
  ];

/**
 * May this membership open this path? Takes a full path or an entity-relative
 * one. Every screen under an entity is a BJJ screen, so a place of another type
 * gets none of them: that is what keeps the nav honest when a second type lands.
 */
export function canVisit(
  pathname: string,
  m: Membership & { type?: string },
): boolean {
  if (m.type !== undefined && !isBjjAcademy(m.type)) return false;
  const path = pathWithinEntity(pathname);
  const rule = ROUTE_ACCESS.find(
    (r) => path === r.prefix || path.startsWith(`${r.prefix}/`),
  );
  return rule ? rule.allowed(m) : true;
}
