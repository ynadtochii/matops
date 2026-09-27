# MatOps monetization plan

> **Status: pricing hypothesis. Not approved for implementation.**
> Updated 2026-09-01 from current competitor pricing and the organization and
> entity model (ADR 124, [architecture §5](architecture.md#5-tenancy-postgres-rls)).

This document covers what an academy or facility pays MatOps. It does not cover
how members pay the academy. Member payments remain a separate provider
integration. MatOps should not depend on payment processing revenue in this
pricing model.

## Recommendation

Do not launch a permanent public free plan yet.

Launch with one paid plan for one BJJ academy. Give design partners free access
with a written end date. Add a multi-entity plan only when the organization
dashboard and shared access plans exist.

The working prices are:

| Offer | Monthly | Annual | When it exists |
|---|---:|---:|---|
| Design Partner | €0 | Not applicable | Pilot only, with a written end date |
| Academy | €49 | €490 | First paid release |
| Facility | €99 | €990 | After multi-entity features ship |
| Network | Custom | Custom | Only after real multi-site demand |

These prices are tests, not promises. The first paid conversions should decide
whether €49 is too low, fair, or too high.

## Why the proposed free tier is risky

The original idea was a free plan for a small academy with one owner. The paid
plan would allow unlimited students and a few instructors. A premium plan would
allow more entities.

Three parts of that model cause problems:

1. **Owner count does not measure customer value.** A small academy can have two
   owners. One owner can run a large academy. An owner limit creates permission
   problems without tracking usage or value.
2. **Instructor limits reduce adoption.** Coaches need schedule, attendance, and
   roster access. A coach kept outside MatOps creates duplicate work and weaker
   data.
3. **A permanent free plan needs a funding source.** Free academies still need
   hosting, support, backups, email, and maintenance. PushPress pairs its free
   plan with higher payment processing rates. MatOps plans to keep payment
   providers separate, so it should not copy that model.

Free users can also give weak product signals. They may stop using the product
without explaining why. A paying academy gives a clearer answer about value.

## What MatOps should charge for

Charge for the operational unit that adds product value and support cost:

- One BJJ academy entity is the base paid unit.
- Extra BJJ academy entities cost more because each adds a full schedule,
  attendance system, staff roles, and reports.
- Simple bookable spaces cost less because they have a smaller feature set.
- Organization-wide reporting, shared people, and combined member access belong
  in the Facility plan.

Do not charge per student, coach, class, booking, or check-in on paid plans.
Unlimited students and staff can become a clear MatOps difference in a market
that often charges by active member count.

Do not charge for data export. Customers must be able to leave with their data.

## Proposed packages

### Design Partner

Use this only for the first 3-5 active pilot academies.

- One BJJ academy entity
- All current pilot features
- Direct founder support
- Free until a date agreed before onboarding
- Expected future price shown as about €49 per month
- No promise of lifetime free access or permanent discounts

The academy must use MatOps weekly and give direct feedback. End access or move
the academy to paid when the pilot ends.

### Academy, €49 per month

This is the first public paid offer.

- One BJJ academy entity
- Unlimited active students
- Unlimited owners, instructors, and staff accounts
- Scheduling, capacity, booking, and attendance
- Member management and BJJ progress tools
- Academy dashboard and reports
- Data export
- Email support with a stated response time
- 30-day trial after the design partner stage ends

Use €490 per year as the annual option. It gives two months free and reduces
invoice work.

Do not split BJJ features across several plans at launch. The product is too
young to know which feature deserves a higher tier.

### Facility, €99 per month

Do not sell this plan until the matching product works.

- Everything in Academy
- One BJJ academy entity
- One additional simple bookable space entity
- Shared person records across entities
- Combined member access plans across included entities
- Organization dashboard with totals and per-entity drill-down
- Organization roles and entity-specific staff access
- Cross-entity reporting

Working add-on prices:

- Extra BJJ academy entity: €39 per month
- Extra simple bookable space: €19 per month

The lower price for a simple space matches its smaller booking and reporting
scope. Revisit these prices after measuring support and usage.

### Network, custom price

Do not build or publish this plan before demand exists. It may later cover five
or more entities, data migration, owner transfer, audit logs, service terms, and
priority support.

## A possible free plan later

A permanent free plan can become a growth test after paid demand is proven. It
should not be the launch default.

If tested, use this narrow shape:

- One BJJ academy entity
- Up to 20 active students
- Unlimited instructors
- Core schedule, booking, attendance, and member list
- Self-service onboarding and community or email support
- Data export
- No organization dashboard or extra entities

The active-student limit gives a clear upgrade point. Do not use owner or coach
limits. Do not offer unlimited students for free unless another revenue source
covers the account cost.

Before launching free, measure:

- Support time per free academy
- Monthly hosting and messaging cost per academy
- Conversion from 20 active students to paid
- Abuse and duplicate academy creation
- Whether free academies remain active after 8 weeks

Remove the free plan if it creates support work without active use or paid
conversion.

## Competitor view, September 2026

| Product | Public price | Pricing unit | Lesson for MatOps |
|---|---|---|---|
| Kicksite | $49 for 0-25 students, then $99-$199 | Active students | €49 is a credible entry price for martial arts software |
| Gymdesk | $75 for up to 50 members, then $100-$200 | Active members and locations | Full features and unlimited staff reduce plan friction |
| Martialytics | $69 for up to 50 students, then $99-$199 | Active students | Martial arts products can charge without feature lockouts |
| TeamUp | $189 for 101-200 active customers | Active customers | Shared customers can be counted once across many locations |
| Zen Planner | Starts at $99 | Base product plus extensions | Marketing and branded products support higher prices later |
| PushPress | Free, $159 Pro, $229 Max | Features and payment rates | Free unlimited usage works because processing rates fund it |

Detailed observations:

- [Gymdesk](https://gymdesk.com/pricing) includes all features and unlimited
  staff at every member tier. It charges $50 for each extra location. Locations
  share members, staff, and reporting.
- [Kicksite](https://kicksite.com/) charges $49-$199 based on active students and
  includes every tool at every size.
- [Martialytics](https://www.martialytics.com/pricing) charges $69-$199 based on
  active students. It advertises unlimited users and locations.
- [TeamUp](https://wf.goteamup.com/pricing) counts an active customer once even
  when the business has unlimited locations.
- [Zen Planner](https://zenplanner.com/pricing/) starts at $99 for membership,
  scheduling, attendance, reporting, and martial arts belt tracking. It sells
  larger product extensions separately.
- [PushPress](https://www.pushpress.com/pricing) offers unlimited members and
  staff for $0 per month. Its free plan lists a 4.99% plus $0.30 card processing
  rate. Pro costs $159 and lists a lower 2.89% plus $0.30 rate.

The published market prices often start above €49. Member count is common, but
it is not required. Extra operational locations are a normal paid unit.

## Positioning

The first useful position is:

> BJJ academy management without per-student or per-coach pricing.

The later position is:

> Run the whole facility from one member base, with BJJ at the center.

Do not market MatOps as a general gym platform before the simple-space booking
module and organization dashboard work. BJJ focus is the first reason to choose
MatOps. Mixed-facility support becomes the expansion reason later.

## Rollout waves

### Wave 1: Prove weekly use

- Onboard 3-5 design partners.
- Put the free end date and expected €49 price in writing.
- Track an academy as active when it records a booking or attendance event in
  the last 7 days.
- Require 3 academies to stay active for 4 consecutive weeks before public
  pricing work starts.

Exit condition: three academies use MatOps weekly without reminders.

### Wave 2: Prove willingness to pay

- Offer the Academy plan at €49 monthly or €490 annually.
- Ask every active pilot for a real paid commitment.
- Keep one package. Do not add feature tiers.
- Record the objection when an academy declines.

Exit condition: at least 2 of the first 3 active pilot academies agree to pay.
If fewer agree, investigate product value before lowering the price.

### Wave 3: Find the price range

- Offer €49 to the first paid cohort.
- Offer €69 to a later set of similar new prospects.
- Compare conversion, time to close, support load, and retention.
- Do this in sequence. The sample will be too small for a formal split test.

Exit condition: choose the price that produces better retained revenue, not the
price with the highest signup count.

### Wave 4: Sell multi-entity value

- Finish the organization and entity pivot.
- Validate that at least three owners need mixed spaces or multiple academies.
- Ship Facility only with shared people, combined access, and organization
  reporting.
- Test €99 with one extra simple space included.
- Charge separately for more BJJ academies and simple spaces.

Exit condition: two customers pay for Facility or sign a clear paid commitment.

### Wave 5: Decide whether free helps growth

- Estimate support and infrastructure cost from paid usage.
- Test the 20-active-student free plan with a small cohort.
- Compare free-to-paid conversion against a 30-day trial.
- Keep only the model that brings more retained paid academies per support hour.

## Customer interview questions

Ask owners these questions before showing a plan table:

1. What do you use today, and what does it cost each month?
2. Which task wastes the most owner or coach time each week?
3. What breaks when you manage BJJ, gym access, and other spaces separately?
4. How many people need owner, staff, or coach access?
5. Would €49 per month require approval from anyone else?
6. At what monthly price would MatOps feel too cheap to trust?
7. At what price would it feel expensive but still worth considering?
8. At what price would you stop considering it?
9. What must work before you would replace your current process?
10. Would you pay €99 for shared members and reporting across two entities?

Do not ask only whether a price sounds fair. Ask for a paid commitment, deposit,
or signed pilot conversion date when the product is ready.

## What the product records now (v7.6)

The offers on this page are **described in the product** and none of them is
charged by it. The signed-out page explains Academy and says Facility is not on
sale until the multi-branch part works. `organization` carries the commercial
state, the offer, the date free use ends, the agreed price with its currency, the
billing contact and the account status, and a gym reads its own in Settings.
There is no card on file and no checkout: an agreement is recorded by a hand-run
script, and money arrives by transfer. Use is measured by `product_event` and read
with `pnpm -F @matops/db report` (see [pilot-plan.md](pilot-plan.md)).

## Metrics

Track these before adding more plans:

- Weekly active academies
- Trial-to-paid conversion
- 30-day and 90-day paid retention
- Monthly recurring revenue
- Support hours per academy
- Activation time from signup to first published schedule
- Percentage of active coaches using MatOps
- Number of entities per organization
- Facility plan conversion among eligible organizations

Do not treat registered students or created academies as success unless those
academies keep using the product.

## Revenue examples

| Mix | Monthly recurring revenue |
|---|---:|
| 15 Academy customers | €735 |
| 10 Academy and 5 Facility customers | €985 |
| 40 Academy and 10 Facility customers | €2,950 |

Extra entity charges are not included. These numbers are revenue before hosting,
support, tax, and payment costs.

## Decisions to keep stable

- MatOps bills the organization, never the student.
- Paid plans do not meter students, instructors, classes, or bookings.
- Payment-provider revenue is not required for the business model.
- Payment processing fees remain visible and separate from the MatOps price.
- The first paid release has one package.
- Multi-entity pricing starts only when multi-entity value exists.
- Every pilot has a written end date.
- Customers can export their data.

## When to review this plan

- Three academies have used MatOps weekly for four weeks.
- The first pilot end date is within two months.
- A pilot refuses or accepts the €49 price.
- Three owners request multiple entities.
- Payment integration costs become known.
- Support exceeds two hours per academy per month.
