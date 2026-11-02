# Students choose and pay for their own membership

**Status: slices 1 to 7 built (ADR 158, ADR 159), tests written, not run. Created 2026-10-28, rewritten 2026-10-31.** Choosing a plan is the **default way a student gets a membership**. Staff assigning a plan by hand becomes the exception (FA2 changes). It builds on the owner payment switch (ADR 154), plan payment links (ADR 156), the card payment webhook (ADR 157) and ways to pay (ADR 158). It needs a new ADR. **Nothing ships until it passes locally.**

## 1. Goal and scope

- **Students** with no plan pick one, then pay by card, by a bank-style method with a proof, or in cash. No staff step is needed to get a plan.
- **Owners** make plans and ways to pay once, then only confirm cash and proofs. They can still assign a plan by hand for special cases.
- **Success:** a new student goes from blocked to booked alone, in about two minutes, with no staff step when paying by card. At Alma, the owner stops assigning ordinary plans.
- **Rules that stay:** monthly months and prices (ADR 40), grace days for renewals, holds after a rejection, the payment switch.
- **Out of scope:** student cancel or pause, a student changing plan once paid, class packs and trials, refunds in the app, subscriptions (Stripe step B2).

## 2. Decisions

1. **Self-serve is the default** (2026-10-31). Every active, priced plan that covers the academy shows to students. The owner can mark a plan **Staff only** (family deals, free plans, coach plans); it then stays out of the student's list. This replaces "owner marks which plans are choosable".
2. **Staff assignment stays as an override**, on the student's Membership tab. It works as today.
3. **Bank-style methods need a proof.** Bank transfer, MB WAY and every other method from Ways to pay: the student uploads a photo or PDF of the payment. With a proof the month is `reported` and the student can book until staff check it. Without a proof the step is not finished.
4. **Cash always waits for staff.** The student picks whom they paid from the staff list and may add a note. They cannot book until staff tap **Cash received**.
5. **Card** confirms the month through the B1 webhook. Without a webhook, the student uploads the Stripe receipt as a proof.
6. **Expo gets native screens** with the same API. Card opens Stripe in the in-app browser.

## 3. Student flow

```
Payments on, student has no plan (or their plan ended)
  Sticky banner on every screen: "Choose a membership to book classes"  [Choose]
    1. Plan     the gym's plans with price, cheapest first
    2. Method   Card (when the plan has a link), then the owner's ways to pay
    3. Finish
       Card    → Stripe page → back → "Checking your payment" → paid
       Bank,
       MB WAY,
       other   → amount, reference, details with copy → upload proof → "Sent for checking"
       Cash    → "Who did you pay?" staff list + day paid + note → "Waiting for the gym"
    4. Done → Book
```

- **Choosing a plan creates the membership at once** (`assigned_by` is the student), starting this month. The first month is unpaid.
- **Leaving is safe.** The banner changes to "Finish paying for {plan}" and reopens step 2.
- **Switching plan** is allowed while the first month is unpaid and has no proof or cash claim. The old membership is removed, not ended, because nothing was paid on it.

### Banner and booking, by state

| State                                   | Banner                                           | Can book           |
| --------------------------------------- | ------------------------------------------------ | ------------------ |
| No plan                                 | Choose a membership to book classes              | No                 |
| No plan, and no plan to choose          | Your gym has not set up memberships yet          | No                 |
| Plan chosen, payment not finished       | Finish paying for {plan}                         | No                 |
| Card paid (webhook) or staff confirmed  | none                                             | Yes                |
| Bank-style, proof uploaded              | Waiting for the gym to check your payment        | Yes, until checked |
| Cash, waiting for staff                 | Waiting for the gym to confirm your cash payment | No                 |
| Rejected                                | Your payment was not accepted. Contact the gym   | No                 |
| Renewal month unpaid, within grace days | Pay {month} by {date}                            | Yes                |
| Renewal month unpaid, after grace days  | Pay {month} to keep booking                      | No                 |

The banner sits on top of every student screen, on web and in the app, until nothing is left to do. The Book button and the server give the same answer.

## 4. Owner side

- **Plans tab:** each plan has a **Staff only** switch, off by default. The hint changes from "Assign a plan from a person's profile" to "Students choose a plan themselves. Assign Staff only plans from a student's profile." A plan needs a price to show to students.
- **Ways to pay** (built, ADR 158) feed step 2. Card shows for a plan whose current price has a Stripe link.
- **Payments tab:** each claim shows the method, the proof (a short-lived link), or the cash note and the staff member named. Actions: **Confirm**, **Reject**, and for cash **Cash received**.
- **Setup checklist:** "Put your members on a plan" becomes "Let students choose a plan": done when a plan that is not Staff only has a price and the gym has a way to pay.
- **Payment switch dialog:** "These students have no plan and will be asked to choose one before booking" instead of "will stop being able to book".

## 5. Edge cases

- **Turning payments on with existing students:** none has a plan, so all see the banner and choose. Nobody is assigned by hand.
- **No plan to choose** (all Staff only, or none priced): the banner says so and booking stays blocked. The setup checklist tells the owner.
- **No way to pay for a plan** (no card link and no ways to pay): the plan is not shown.
- **Pending students** see nothing until approved.
- **One plan per student per academy.** A student holding a plan does not see the plan list.
- **Price change:** the month keeps the price in effect when it was written. A new price needs a new Stripe link (ADR 156).
- **Proof rejected:** the month becomes rejected with a hold; the student sees the reason and contacts the gym.
- **A staff member named for cash leaves:** the claim keeps the name as text.
- **Receipts are personal data:** read through 5-minute signed links, deleted after 61 days (ADR 152 F10).
- **Two tabs choosing at once:** the server allows one open membership per student per academy, so the second choice resumes the first.

## 6. Data changes (structure only)

- `access_plan.staff_only` boolean, default false. Existing plans become choosable.
- `membership_month`: `payment_method_id`, `cash_paid_to` (user id, nullable), `cash_paid_to_name` (text), `cash_paid_on` (date, migration `0018`), `payment_note` (text). `proof_file_id` already exists.
- No new column on `access_assignment`: `assigned_by` equal to the student's own user marks a student choice.
- `payment_method` already exists (ADR 158).

## 7. Rules (domain first, with tests)

- `choosablePlans`: active, not Staff only, priced this month, covers the academy, and has at least one way to pay.
- A student-chosen first month has no grace days: it blocks until confirmed, or `reported` with a proof.
- `reported` admits only with a proof or a card session; a cash claim never admits before confirmation.
- Renewal months keep the owner's grace days.
- Banner verdicts: `choose_plan`, `no_plans`, `finish_payment`, `waiting_proof_check`, `waiting_cash`, plus the existing ones.

## 8. Slices

Ordered so a student can choose and pay by card as early as possible.

1. **Ways to pay.** Built (ADR 158).
2. **Choosing a plan.** `access_plan.staff_only` and the Plans switch; `accessPlan.choosable` (the student's list) and `accessPlan.choose` (creates the membership, or swaps it while unpaid); domain rule and tests.
3. **Booking rule and banner.** The first-month rule, the banner verdicts, the gate, and the sticky banner on web. Checklist and switch dialog wording.
4. **Web flow, card and cash.** Plan, method, finish; Pay by card with the reference; cash with the staff list and note; resumable.
5. **Proof upload (ADR 152 F10).** The `payment_receipt` rule (JPEG, PNG, WebP, PDF), signed reads, 61-day expiry; the bank-style finish step.
6. **Owner tools.** Method, proof and cash details on claims; **Cash received**.
7. **Expo.** Banner and the same flow natively; Stripe in the in-app browser; proof from the camera or photo library.

Slices 2 to 4 together are the first usable release: choose, then pay by card or cash. Bank-style methods join the flow with slice 5. Each slice: domain rule and tests first, then API, then screens; spec, architecture, ADR, roadmap and changelog in the same change (delivery.md §4).

## 9. Open questions

1. **Changing plan once paid.** Should a student switch plan from next month without staff (ADR 129 records scheduled changes)? Not in this plan.
2. **Notifications.** Should staff get an email or push when a proof or a cash claim waits? Not in this plan.
