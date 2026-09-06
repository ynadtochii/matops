import type { Membership } from "./access";
import { isStaff, runsBranch } from "./access";

/**
 * What kinds of place an organization may run (ADR 124).
 *
 * The list is fixed in two places on purpose: here, and the `entity_type_supported`
 * check constraint on the table. Adding a type needs a migration to widen the
 * constraint, so the two cannot drift without someone noticing.
 */
export const ENTITY_TYPES = ["bjj_academy", "general_space"] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export function isSupportedEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value);
}

/** True for the type that gets the BJJ screens: belts, curriculum, referrals. */
export function isBjjAcademy(type: string): boolean {
  return type === "bjj_academy";
}

/** True for a gym, a sauna, or any other room an organization books people into. */
export function isGeneralSpace(type: string): boolean {
  return type === "general_space";
}

/**
 * How a session at this kind of place treats its capacity. A general space has
 * ONE room, so a full session is full; a BJJ mat has always let the count run
 * over and shown it red (spec §4), and changing that under an existing academy
 * is not this release's business (ADR 126).
 *
 * It hangs off the TYPE and never off the row it was copied from: a BJJ
 * schedule copied into a general space is a general space's schedule.
 */
export function capacityPolicyFor(type: string): "soft" | "strict" {
  return isBjjAcademy(type) ? "soft" : "strict";
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
 * `runsBranch` is owner-or-manager, so a gym's manager is offered the same
 * screens they are allowed to use (ADR 129).
 *
 * `/overview` and the top-level `/profile` are NOT here. They belong to the
 * organization, not to a place, and are gated by the procedure they read:
 * `entity.list` refuses anyone who is not an organization member and lists only
 * the entities the caller may open (ADR 124).
 *
 * `types` narrows a screen to the kinds of place that have it. A general space
 * runs a schedule, a roster and its own settings, but referrals are a BJJ
 * programme, so the rule names the one type that gets them (ADR 126).
 *
 * This is convenience, not security. The tRPC tier is the real guard
 * (`packages/api/src/trpc.ts`); this only decides what a person is offered.
 */
const ROUTE_ACCESS: {
  prefix: string;
  allowed: (m: Membership) => boolean;
  types?: readonly EntityType[];
}[] = [
  { prefix: "/members", allowed: isStaff },
  { prefix: "/referrals", allowed: runsBranch, types: ["bjj_academy"] },
  { prefix: "/settings", allowed: runsBranch },
  { prefix: "/schedule", allowed: isStaff },
  { prefix: "/coaches", allowed: isStaff },
  { prefix: "/attendance", allowed: isStaff },
];

/**
 * May this membership open this path? Takes a full path or an entity-relative
 * one. A type nobody implemented gets nothing, so a place this build does not
 * understand can never be browsed by guessing a URL.
 */
export function canVisit(
  pathname: string,
  m: Membership & { type?: string },
): boolean {
  if (m.type !== undefined && !isSupportedEntityType(m.type)) return false;
  const path = pathWithinEntity(pathname);
  const rule = ROUTE_ACCESS.find(
    (r) => path === r.prefix || path.startsWith(`${r.prefix}/`),
  );
  if (!rule) return true;
  if (rule.types && m.type !== undefined && !rule.types.includes(m.type))
    return false;
  return rule.allowed(m);
}

export interface BranchTie {
  academyId: string;
  organizationId: string;
  name: string;
}

export type PostLoginTarget<T extends BranchTie = BranchTie> =
  | { kind: "join" }
  | { kind: "openGym"; organizationId: string; name: string }
  | { kind: "openBranch"; academyId: string; name: string }
  | { kind: "pick"; gyms: T[] };

/**
 * Where a session that names no gym should land (ADR 49, amended by ADR 128
 * and ADR 129).
 *
 * Somebody who RUNS a gym lands on its overview, whether or not they also
 * train at one of its branches: the overview is the actionable screen for the
 * job they came to do, and the branch is one link away. That also fixes the
 * case ADR 128 found, where an owner with no branch yet held no
 * `entity_membership` and was offered the student join-by-code form.
 *
 * Everybody else lands on their branch. One tie per gym is what counts, not
 * one per branch, because somebody who trains at two mats of one gym is not
 * being asked to choose between gyms.
 */
export function postLoginTarget<T extends BranchTie>(
  ties: readonly T[],
  runsGyms: readonly { organizationId: string; name: string }[],
): PostLoginTarget<T> {
  const runs = runsGyms[0];
  if (runs) {
    return {
      kind: "openGym",
      organizationId: runs.organizationId,
      name: runs.name,
    };
  }

  const gyms = new Map<string, T>();
  for (const t of ties) {
    if (!gyms.has(t.organizationId)) gyms.set(t.organizationId, t);
  }
  if (gyms.size === 0) return { kind: "join" };

  const only = gyms.size === 1 ? [...gyms.values()][0] : undefined;
  if (only) {
    return { kind: "openBranch", academyId: only.academyId, name: only.name };
  }
  return { kind: "pick", gyms: [...gyms.values()] };
}

/**
 * Query parameters that survive a branch switch (ADR 129).
 *
 * A date is a date wherever you are standing, so the week you were reading
 * follows you. A person, a class and a session belong to the branch you are
 * leaving, so their ids do not: showing branch A's member id under branch B's
 * name is the interface lying about which mat you are on.
 */
const PORTABLE_PARAMS = new Set([
  "date",
  "from",
  "to",
  "week",
  "tab",
  "filter",
]);

/** Routes whose id lives inside the path, so the path itself cannot travel. */
const BRANCH_OWNED_PREFIXES = ["/class", "/attendance"];

/**
 * The same screen at another branch, or that branch's home when it has no such
 * screen (ADR 129).
 *
 * `membership` is the caller's standing AT THE DESTINATION, which is what
 * decides whether the destination even offers the screen. A general space has
 * no referrals, a student has no roster, and either case falls back to the home
 * page rather than to a refusal.
 */
export function switchEntityHref(
  pathname: string,
  search: string,
  target: { id: string } & Membership & { type?: string },
): string {
  const within = pathWithinEntity(pathname);
  const portable =
    !BRANCH_OWNED_PREFIXES.some(
      (p) => within === p || within.startsWith(`${p}/`),
    ) && canVisit(within, target);
  const path = portable ? within : "/";
  if (path === "/") return entityHref(target.id);

  const query = search
    .replace(/^\?/, "")
    .split("&")
    .filter((pair) => PORTABLE_PARAMS.has(pair.split("=")[0] ?? ""))
    .join("&");
  return `${entityHref(target.id, path)}${query ? `?${query}` : ""}`;
}
