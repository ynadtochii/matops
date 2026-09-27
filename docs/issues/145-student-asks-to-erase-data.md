# 145 · A student asks the gym to erase their data

**Status:** accepted · **Date:** 2026-09-27 · **Area:** Profile (web), Students, Dashboard, erase

## Decision

A student cannot delete their own account. They **ask** the gym instead, and an owner or manager does the erase. The academy controls its members' data (ADR 76), so the person who answers a deletion request is the gym, not the member.

- **Request.** Web Profile has a **Your data** section for students. **Ask to erase** sets `entity_membership.erasure_requested_at` for their membership at this academy. Asking twice keeps the first date. **Withdraw request** clears it. Nothing is deleted by the request. Staff are refused. A suspended student has no academy access (spec S3), so Profile tells them to ask the gym directly.
- **Queue.** Owners and managers see an **Erase requests** count on the Dashboard queue. It opens the Students **Requests** tab, which lists the people who asked, with the date, above the join requests. **Erase data** there runs the existing `membership.purge`, confirmed by typing the member's name.
- **Who can erase.** `membership.purge` now allows an owner **or a manager**. A manager cannot erase an owner or anyone who runs the gym (the same `requireBranchLifecycleChange` guard as suspend and archive). Instructors are still refused. This replaces the "permanent erase stays with owners" rule from ADR 129.
- **What the erase does** is unchanged (ADR 84): every record this gym holds about the person, and their sign-in unless they belong to another gym.

## Why not self-delete

A first version let a student delete their account directly. We dropped it: the gym is the controller of its member records, and an owner may need to keep some records or talk to the member first. A request keeps the owner in charge and still gives the member one clear action.

## Database

Migration `0006_erasure_request` adds one nullable column, `entity_membership.erasure_requested_at timestamptz`. It is additive, so it is safe while the old build still serves.

## Also in this change

- Web Profile loses "More branches". It pointed to a sidebar picker the first release removed, and a second gym joined there could not be opened. `JoinAnotherBranch` and the compact `JoinByCode` mode are gone.
- Web Profile links to `/privacy` next to the feedback link.
- Student-facing web text says "gym" instead of "branch" (loaders, the pending banner, the open-gym error).
