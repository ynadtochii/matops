# 151 · Drop-in sharer credit: a lead remembers who brought them

**Status:** accepted, built (tests written, not run; `0011` not applied) · **Date:** 2026-10-14 · **Area:** `packages/db` (`scheduling.ts`, `dropin.ts`, migration `0011_drop_in_shared_by`), `packages/validators` (`checkin.ts`), `packages/api` (`router/dropin.ts`), `apps/nextjs` (`invite-link-card.tsx`, `class-drop-in-link.tsx`, `drop-in/[token]`, `leads.tsx`) · **Supersedes in part:** [147](147-drop-in-link-booking.md) 2026-10-13 addendum ("No credit for the sharer")

## Context

Staff and students share the drop-in link. The owner sees a new lead but not who brought them, so they cannot thank the student or see which coach fills classes. ADR 142 removed referrals (a ledger with money per referrer). This is smaller: one name on a lead, nothing more.

## Decision

1. **The link carries the sharer.** A link that a member copies or shares adds `by=<entity_membership id>`. `dropIn.link` returns the caller's membership id next to the token. A staff member with no membership row at this academy gets a plain link. The **QR code stays plain**: a printed QR on the wall would credit whoever printed it, and the credit would stop meaning "who brought them".
2. **The first sharer stays.** The submit saves the sharer only while the lead has none. A later link from someone else never replaces it. A lead that came with no sharer gets the first one who later brings them back.
3. **A bad `by` never blocks a visit.** The validator drops a missing, empty or oversized value (`.catch(undefined)`). The server keeps the id only if that membership belongs to the academy the token resolves to; any status counts, because the share happened while the member could share. Otherwise it logs `[drop-in] sharer ignored` and books the visitor as usual.
4. **Who sees it.** Owners and managers, as "Brought by {name} · student|coach" in the Drop-in leads list. The visitor form shows nothing new, so a link never shows a member's name. Instructors still cannot open the leads list.
5. **Erasure.** `drop_in.shared_by_membership_id` references `entity_membership(id)` with `ON DELETE SET NULL`. Erasing a member deletes their membership row, and the credit clears with it. Archived and removed members keep their row and their credit.

## Consequences

- Anyone who edits the URL can credit a different member, but only by knowing that member's random id. That is acceptable while credit earns nothing. If credit ever earns a reward, sign the id.
- A member's id never changes, so their links credit them for as long as they exist. Rotating the drop-in token does not touch `by`.
- A member can fill in the form through their own link and credit themselves. Accepted: it earns nothing.
- No new procedure, no permission change, no Expo work (the app has no share button yet).

## Database

Migration `0011_drop_in_shared_by` adds `drop_in.shared_by_membership_id text` (foreign key to `entity_membership.id`, `ON DELETE SET NULL`) and the partial index `di_by_sharer`, so a membership delete does not scan `drop_in`. Structure only, no backfill. **Rollback:** revert the code and leave the nullable column; never drop it in the same deploy.
