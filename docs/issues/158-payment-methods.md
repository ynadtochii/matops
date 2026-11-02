# 158 · Ways to pay: a list of payment methods replaces the one bank details field

**Status:** accepted, built (tests written, not run; migration `0016_payment_method` applied to dev 2026-10-28, not production) · **Date:** 2026-10-28 · **Area:** `packages/db` (`payment_method`), `packages/domain` (`payment-method.ts`, setup step `pay`), `packages/validators`, `packages/api` (`paymentMethod` router, `accessPlan.mine`, `accessPlan.policy`, `organization.setup`), `apps/nextjs` (Settings, membership notice, setup checklist), `apps/expo` (Profile) · **Plan:** [Students choose and pay for their own membership](../student-memberships-plan.md), slice 1 · **Changes:** [127](127-the-owner-level.md) (one bank details text per gym)

## Context

Students are going to pick a plan and pay for it themselves. Gyms in Portugal take money in several ways: bank transfer, MB WAY, cash, and local apps. Today a gym has one free-text field, `membership_policy.bank_details`, and the student flow cannot tell a bank transfer from cash. The next slices need to know which way a student paid, so each way must be its own row.

## Decision

1. **`payment_method`**, one row per way to pay, owned by the gym (RLS on `app.organization_id`, like `membership_policy`). Columns: `kind` (`bank`, `mbway`, `cash`, `other`), `label` (the name students see), `details` (account, phone number or instructions), `enabled`, `position`. At most 10 per gym.
2. **Card is not a row.** Card exists when a plan price has a Stripe Payment Link (ADR 156), so a card row could disagree with the links.
3. **Details are required** for every kind except cash. Bank, MB WAY and other methods carry the student's reference; cash does not.
4. **Owners and managers** add, edit, hide, remove and reorder methods in Settings, Ways to pay (`paymentMethod.list`, `save`, `remove`, `reorder`). The same tier set the bank details before.
5. **Students** get the visible methods, in order, from `accessPlan.mine` (`paymentMethods`), which replaces `bankDetails`. The current "I paid" flow does not change in this slice.
6. **Setup step.** The checklist step `bank` becomes `pay`, "Add how students can pay you". It is done when the gym has a visible method or a plan price with a Stripe link.
7. **`bank_details` stays in the database** for now and nothing reads or writes it. `accessPlan.policy` and `setPolicy` no longer carry it. A later deploy drops the column. `packages/db/scripts/2026-10-28-bank-details-to-payment-method.sql` copies old bank details into a Bank transfer row; dev had none on 2026-10-28.

## Consequences

- A gym can list MB WAY, cash and its own local apps next to the bank account, each with its own copy button.
- Old app builds read `bankDetails` from `accessPlan.mine` and now get nothing, so they show "Ask your gym how to pay" until updated. Production has one real academy. Its students see this only if the owner has turned payment on.
- Slices 2 to 7 of the plan link a month to the method the student used.

## Addendum 2026-10-30: owner only

Changing the IBAN or MB WAY number changes who receives the money. `paymentMethod.save`, `remove` and `reorder` are now owner only; managers keep `list`. Settings shows managers the list without edit buttons. Decision 4 above said "owners and managers"; this replaces it.
