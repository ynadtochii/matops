# Business model — what matops charges

> **Status: reference and research. Not scheduled, not decided.**
> The near-term plan is a **pilot with a few test academies, unpriced**. Nothing
> in this file is being built or acted on. It exists so the research is not
> repeated when pricing becomes a real question.
>
> Companion: [revenue-collection.md](revenue-collection.md) — how money would
> reach a bank account, and why the founders dashboard should not be built.
> Researched 2026-08-22.

Scope note: this is about **gyms paying matops**. It has nothing to do with
students paying gyms, which is the separate parked
[card-billing-plan.md](card-billing-plan.md).

Inputs this was researched against:

| | |
|---|---|
| Entity | Portugal sole trader (recibos verdes), plus a Ukrainian FOP |
| 12-month goal | 5-15 gyms, mostly ones already known personally |
| Customer | The gym owner. Never the student |

---

## The shape, if it were decided today

**One flat price per academy. €39 per month, or €390 per year. No tiers, no
per-member pricing, no per-coach seats.**

First three to five gyms free as design partners, **with a written end date**.

Everything below is the reasoning, kept so it does not have to be rebuilt.

---

## Market pricing, mid-2026

| Product | Price | Model |
|---|---|---|
| Mindbody | $149 - $699+ | Feature tiers |
| Zen Planner | $99 / $198 / $348 | Member tiers |
| PushPress | Free / $159 / $229 | Feature tiers |
| TeamUp | from $104, up to 100 active | Member tiers |
| Gymdesk | $75 (up to 50) - $200 (up to 400) | Member tiers |
| Gymsense | 1% of payment volume | Take rate |

At **150 members** the market splits hard: flat-rate platforms sit near **$169**
while per-member platforms pass **$399**. That gap is the wedge.

---

## Why flat, against a tiered market

**"One price. Grow as big as you want."** holds against every name in that table,
a gym owner understands it in one sentence, and it costs nothing at small scale.

The practical reasons matter more than the positioning:

- **Tiers need counting and enforcing.** Member-count metering has to be built,
  then an awkward conversation happens when a gym crosses a line. For maybe €20 a
  month of extra revenue.
- **Per-member pricing punishes the best customers.** The gym that grew from 40
  students to 120 *because matops helped* is the one that gets a bigger bill. It
  also gives every owner a reason not to add casual students, which destroys the
  data the whole product runs on.
- **Per-coach seats are worse.** A grappling gym has two to four coaches. Seat
  pricing creates a "should I really add Miguel" decision, and every coach kept
  out is a coach not using the product.

## Why €39

Deliberately under Gymdesk's $75 entry tier. The real test is: **can the owner
decide alone, in under a minute, without asking anyone.** Above roughly €60 they
start thinking about it, and thinking is how small deals die.

**Annual (€390) is worth pushing, and not for cashflow.** It turns twelve
recibos verdes per gym per year into one. At 15 gyms that is 15 documents a year
instead of 180. See [revenue-collection.md](revenue-collection.md).

## What never gets charged for

- **Students.** Never. They are the network that makes the product worth anything
  to the owner. The moment a student hits a matops paywall, the owner's job got
  harder, not easier.
- **Extra coaches.** See above.
- **Classes, bookings, or check-ins.** Usage pricing on the thing you want more
  of is self-defeating.

## Upsells that exist later, not now

- **The card rail.** Charging dues on behalf of the gym, either as a flat uplift
  or a small take rate. Gymsense sells 1% of dues volume as its entire model, so
  the willingness exists. Parked: [card-billing-plan.md](card-billing-plan.md).
- **SMS reminders.** Real cost, real value, priceable at cost plus a bit.
- **A second location.** The one place a "per" charge is genuinely fair, because
  it is genuinely more product.

None of these are needed to reach 15 gyms. They are what gets sold to gyms 30
through 100.

---

## The numbers

```
15 gyms x €39/mo                =  €585/mo    €7,020/yr
Vercel Pro (required once paid)   -€20/mo
Neon, Resend, EAS                 -€0-20/mo
Apple Developer (€99/yr)          -€8/mo
                                 ---------
Net                             ≈  €540/mo   ≈ €6,500/yr
```

**Charging money triggers the Vercel trap already documented in
[infra-costs.md](infra-costs.md).** Vercel Hobby forbids commercial use, and a
paying gym makes the deployment commercial from the day the first €1 is charged.
Once invoicing starts, Vercel Pro stops being a "reactively, if flagged"
decision. Budget it as a fixed cost of charging at all.

### The fork that has to be chosen out loud

- **If income is the goal:** €6,500 a year is a paid hobby with a real product,
  not income. The shape that produces income is roughly 60 gyms at €49, and that
  is a different amount of life. Decide it deliberately, not by drifting.
- **If a great product for your own sport is the goal:** 15 gyms at €39 is
  exactly right, it pays for itself and a bit more, and the number should stop
  being optimised.

Either way: **charging €39 versus €0 matters far more than €39 versus €59.** A
paying customer answers emails, says what is broken, and forgives a bug. A free
one quietly stops opening the app. The number is almost irrelevant. The fact of
it is not.

---

## What this means for the unpriced pilot

The pilot is the right next step and none of the above blocks it. Three things
are worth carrying into it anyway, because they are free now and expensive to
retrofit:

1. **Give every pilot academy an end date in writing, from day one.**

   > "matops is free for you until [date]. After that it will be somewhere around
   > €39 a month. In exchange I need you actually using it, and I need to hear
   > when it annoys you."

   Without a date, the pricing conversation never happens, because there is never
   a good week to bring it up. With one, it has already happened.

2. **Track weekly active academies from the first pilot gym.** An academy with at
   least one booking or attendance mark in the last seven days. This is the only
   number that tells you whether pricing is even a question worth answering.

3. **Do not promise "free forever" or "you'll be grandfathered".** Both are easy
   to say to a friend during a pilot and permanently expensive afterwards.

---

## How the pricing side fails

1. **The pilots never convert.** No written end date, no conversation, no
   revenue, and eighteen months gone. The most likely failure by a wide margin,
   and it is fixed on day one by one sentence in an email.
2. **Friends do not complain, they just stop.** Gyms known personally will not
   say the schedule screen is confusing. They nod, then quietly go back to
   WhatsApp. Ask directly and specifically, every month. Silence is not approval.
3. **Vercel Pro is forgotten.** Charging makes the deployment commercial from day
   one. Handle it before the first invoice, not when Vercel sends an email.
4. **Support eats the evenings.** Fifteen gyms is real support load. Set the
   expectation in writing at signup: email only, reply within two working days,
   no phone. Owners accept this happily when told up front, and never when told
   after the third call.

## The second-order effect worth naming before the first invoice

Charging money changes what matops is allowed to be. Today the schedule can break
on a Tuesday and be fixed on Thursday. With fifteen paying gyms it cannot,
because Tuesday is when a coach needs the roster. The real price of the first €39
is not a support inbox. It is an obligation to keep it running on days you do not
feel like it.

That is a reasonable trade. It is worth making on purpose, before the first
invoice, rather than discovering it on a Tuesday.

---

## When to reopen this file

- A pilot academy asks what it will cost.
- Three or more academies are using matops weekly without prompting.
- The pilot end date is within two months.

## Sources

- [Gym management software cost 2026](https://gymdesk.com/blog/gym-management-software-cost)
- [Gym software pricing compared 2026](https://www.chalkitpro.com/post/gym-software-pricing-comparison) (the flat vs per-member gap at 150 members)
- [2026 vertical SaaS embedded payments benchmarking](https://www.rainforestpay.com/blog/2026-vertical-saas-embedded-payments-benchmarking-study)
- [SaaS churn benchmarks 2026](https://getspike.ai/blog/saas-churn-rate-benchmarks/) (vertical SaaS churns 20-40% less than horizontal)
