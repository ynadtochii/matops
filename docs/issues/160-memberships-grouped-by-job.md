# 160: Memberships grouped by job

**Status:** accepted, 2026-10-31. Changes where ADR 154, 156, 157 and 158 put their screens. No data or rule changes.

## Problem

Payment screens were spread over two pages and mixed four jobs that happen at different speeds:

- Setting up payments (the on/off switch, ways to pay, the Stripe webhook) sat in academy Settings, between the desk link and the danger zone.
- Plans had their own tab, plus a second copy of Ways to pay in a side panel.
- Checking money (claims, card payments to check) shared the Payments tab with the month board.
- Fixing access (students with no plan, bookings to review) had its own Needs action tab.
- The grace days rule had an API (`accessPlan.policy`, `setPolicy`) and no screen.

The code matched: `memberships-screen.tsx` was 1,592 lines and `router/accessPlan.ts` 2,454 lines.

## Decision

Memberships has four tabs, one per job:

1. **To check** (default, with a count): payment claims and card payments to check under Money; students with no plan and bookings to review under Access. It says "Nothing to check." when both are empty. Old links `?tab=payments` and `?tab=access` open it.
2. **Months:** the month board (who paid, who is late, Mark paid).
3. **Plans:** what the gym sells. Each plan keeps its Students switch and its ways-to-pay chips. A line on top lists the ways to pay that are on and links to Setup. There is no settings panel on this tab.
4. **Setup:** the Membership payments switch for each academy, Ways to pay (the only place to add, edit, hide or reorder them), Card payments (the webhook), and **Days to pay** (grace days, the first screen for `setPolicy`).

Settings keeps only academy things. Its Payments row shows On or Off and opens Setup. The setup checklist sends "Add how students can pay you" to Setup and "Check every member is covered" to To check.

Memberships stays outside the academy URL (ADR 126). The switch is an academy procedure, so the web tRPC client now takes an `entityId` in a call's tRPC context and sends it as `x-matops-entity`, through an unbatched link. The client still names the academy, and the server still checks it.

## Code

- Web: `memberships-screen.tsx` is the tab shell. The tabs live in `_components/memberships/` (`to-check.tsx`, `months.tsx`, `plans.tsx`, `setup.tsx`). `membership-settings.tsx` moved into `setup.tsx`.
- API: `router/accessPlan.ts` spreads four groups from `router/access-plan/` (`catalog.ts`, `holders.ts`, `months.ts`, `policy.ts`, with `shared.ts`). Procedure names stay the same, so old mobile builds keep working.

## Not changed

Student screens on the web and in the app, the student's Membership tab for staff, every rule and every message from the server.
