# 63 · Settings splits by job — each control moves to the screen that uses it

_(Web IA, spec **O4** / **O6** / **O7** / **O10**. Supersedes the placement half of ADR [50](50-owner-web-ia.md); the rules themselves (never-ownerless, pending-until-approved, one link per role) are unchanged. No API, schema, or migration change.)_

## Context

Settings had become the drawer where anything academy-wide was dropped. It held five unrelated things: the academy name and code, the whole staff list with the instructor invite link, the student invite link, the bank details, and the venue check-in poster. Four of the five are the setup step of a job that lives on another screen.

The cost showed up in copy. The Coaches screen, which is where an owner approves a pending coach, had an empty state reading "Share the instructor invite link from Settings". The Members screen explained that drop-in leads come from the gym QR while the QR itself was two screens away. A screen that has to tell you to go somewhere else to finish the job is the wrong screen.

## Decision

Each control moves to the screen that already owns its outcome. Nothing is deleted, no procedure or permission tier changes.

| Control                           | Was      | Now                                      |
| --------------------------------- | -------- | ---------------------------------------- |
| Staff list + instructor link      | Settings | **Coaches** (O10), below the coach cards |
| Student invite link               | Settings | **Members** (O4), above the tabs         |
| Venue check-in QR poster          | Settings | **Members** → Drop-in leads tab          |
| Bank details (payment requisites) | Settings | **Payments** (O7), a "Bank details" tab  |
| Academy name + code               | Settings | **Settings** — the only thing left       |

Two placements are deliberate rather than obvious:

- **Staff sits below the coach cards, not above them.** Coaches is a reporting screen; the workload cards are what an owner opened it for. Pending coach approvals stay on top because they are a queue someone is waiting in. Roster management is setup, so it goes last.
- **The check-in poster lives inside the Drop-in leads tab**, not loose on the Members screen. The poster is the only thing that creates a lead, so the empty state ("first-time visitors who check in via the gym QR show up here") now sits directly under the QR that produces them.

`Staff` renders only for owners on Coaches (`membership.staff` and both role mutations are `ownerProcedure`, and instructors reach that screen for their own card). Members and Payments are owner-only routes already, so the other three moves need no new guard.

## Consequences

Settings is now one section. That is the honest size of it: an academy has a mutable name and a permanent code, and nothing else there is a setting. Time zone and disciplines, when they land, join it.

Spec §O6 shrinks accordingly, and the O4 / O7 / O10 sections take the moved rules. Anything pointing a reader at "Settings" for a link, the staff list, or bank details is now wrong and was updated in the same change.
