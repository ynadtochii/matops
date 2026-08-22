import type { Membership } from "@matops/domain";
import { isOwner, isStaff } from "@matops/domain";

/**
 * Which routes under `(app)` need more than membership. One table, read by both
 * the sidebar (what to show) and the shell (what to render), so the nav and the
 * guard cannot disagree. Anything absent is open to every member: the home
 * page, `/payments`, `/profile`, `/training` and `/class/<id>` all branch by
 * role inside the screen instead (ADR 73).
 *
 * This is convenience, not security. The tRPC tier is the real guard
 * (`packages/api/src/trpc.ts`); this only decides what a person is offered.
 */
const ROUTE_ACCESS: { prefix: string; allowed: (m: Membership) => boolean }[] =
  [
    { prefix: "/members", allowed: isOwner },
    { prefix: "/referrals", allowed: isOwner },
    { prefix: "/settings", allowed: isOwner },
    { prefix: "/schedule", allowed: isStaff },
    { prefix: "/coaches", allowed: isStaff },
    { prefix: "/attendance", allowed: isStaff },
  ];

/** May this membership open this path? */
export function canVisit(pathname: string, m: Membership): boolean {
  const rule = ROUTE_ACCESS.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  return rule ? rule.allowed(m) : true;
}
