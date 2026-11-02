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

## Addendum 2026-11-01: the erased person is signed out

After **Delete permanently**, the erased student kept a session that named the gym, and the cached session cookie kept it alive for up to five minutes even when their account was deleted. Every call then failed with "You are not a member of this gym", and the web showed "Couldn't load your gyms" with a retry that could never work.

- When the gym membership row goes, `deleteMemberRow` clears `active_organization_id` on that person's sessions for this gym. Sessions for their other gyms stay. A deleted account takes its sessions with it, as before.
- That refusal now carries `membershipGone: true` in the error data (`MembershipGoneError` as the cause in `resolveOrganization`), so a client can tell it from other refusals without reading the message.
- The web and the app watch every query and mutation for it. On the first one they sign out, clear the cache (and in the app the stored academy, local reminders and the stored push token), and open sign-in with `access=ended`. Sign-in then says "You were signed out. Your access to that gym has ended." and does not send a still-signed-in browser back to `/`, so a sign-out that failed cannot loop; it signs out again and reloads.

## Addendum 2026-11-01: erase removes the person record

The gym's `person` row (name, email, phone) survived the erase: `deleteMemberRow` only cleared `account_user_id`. When the same email joined again, `ensureAccountPerson` matched that unlinked row by email and linked it back, so the gym saw the old name and phone and the row's history, while the student's own profile showed the new ones.

`deleteMemberRow` now blanks the row (name "Erased member", no email, no phone, archived, no account) and deletes it when nothing points at it any more (class bookings, academy memberships, assignments, plan changes, holds). It runs only when the person has left the whole gym, so a person who still trains at another academy of the gym keeps their row. A later join with the same email finds nothing and starts a new row.

Rows erased before this change still hold the old name, email and phone without an account. They are not cleaned up by this change.
