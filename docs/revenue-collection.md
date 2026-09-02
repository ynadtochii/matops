# Collecting matops revenue, and the founders dashboard

> **Status: reference and research. Not scheduled, not decided.**
> The near-term plan is a **pilot with a few test academies, unpriced**, so none
> of this is needed yet. It exists so the research is not repeated when the first
> invoice becomes real.
>
> Companion: [business-model.md](business-model.md) — what matops would charge
> and why. Researched 2026-08-22.

> **Not tax advice.** The Portuguese rules below are the shape of the thing, from
> public sources. Two entities in two countries is exactly the case where you pay
> a contabilista once and get it right. Do that before the first invoice, not
> after.

Scope note: here **matops is the merchant** and the **gym is the customer**. This
is a completely separate thing from the parked
[card-billing-plan.md](card-billing-plan.md), where each gym's own Stripe account
takes money from students. Do not let the two get conflated. **This one needs no
code in matops at all.**

---

## Part 1 — How the money would be collected

### The short version

1. **Stripe Billing on your own Portuguese Stripe account.** Portugal is
   supported.
2. **Issue the fatura-recibo by hand** on the Portal das Finanças. At 15
   customers, once a month, about twenty minutes.
3. **Push annual billing** so step 2 happens once per gym per year, not twelve
   times.
4. Automate only when step 2 stops being twenty minutes, around 25-30 customers.

### Use the Portuguese entity, not the Ukrainian one

Two hats exist. For this the Portuguese sole trader is the right one, and it is
not close:

- **Stripe onboards Portugal. It does not onboard Ukrainian businesses at all.**
  That single fact decides it. Running matops revenue through the FOP means no
  card payments, which means chasing fifteen bank transfers by hand every month.
- **The customers are EU and US gyms.** A Portuguese invoice is an unremarkable
  document to both. A Ukrainian FOP invoice raises questions with a US gym's
  bookkeeper.
- **FOP rules expect the money to land in a Ukrainian bank**, which fights
  everything else being attempted here.

Which entity you are actually tax resident through, and how the two interact, is
the contabilista question. The **operational** answer is unambiguous: Stripe,
Portugal, recibos verdes.

### Skip the merchant of record

Paddle and Lemon Squeezy both charge about **5% + $0.50** per transaction. Both
exist to solve one problem: global VAT compliance when selling into dozens of
countries with legal liability everywhere.

That problem does not exist here:

- An EU entity already exists.
- At around €7,000 a year, turnover is well under the **€15,000** Article 53
  exemption threshold, so IVA is likely not charged at all.
- The customers are a handful of gyms, not thousands of anonymous buyers.

At 15 gyms an MoR would cost roughly **€350 a year to solve a problem you do not
have**, and it puts a third party between you and your own customers. Revisit
only when selling across many EU countries **and** past €15,000.

### The VAT shape, and the €15,000 cliff

For 2026 the number is **€15,000** of annual turnover. Under it, Article 53
exemption applies and no IVA is charged. Cross **€18,750** (the threshold plus
25%) during the year and the regime is exited immediately.

**€15,000 at €49/month is about 25 gyms.** That sits past a 15-gym target,
so it is a cliff to plan for rather than stumble into.

### Not every customer costs the same to serve

| Customer | IVA treatment | Admin cost |
|---|---|---|
| **Portuguese gym** | Domestic, Article 53 exempt while under €15k | Lowest |
| **US gym** | Outside the scope of Portuguese IVA | Lowest |
| **Other EU gym** | Reverse charge: issue with no IVA, mark `IVA - autoliquidação`, record their VIES number | Adds a recurring **declaração recapitulativa** filing |

A German gym is not the same customer as a Portuguese or American one. Still a
fine customer, but it comes with a recurring form. With limited evenings,
**Portugal and the US are the cheap ones to serve.** Confirm the exact mechanics
with a contabilista, especially whether a VIES registration is needed while
Article 53 exempt.

### The tooling ladder, climbed only as far as necessary

| Customers | Setup |
|---|---|
| **1-5 (the pilot)** | **Nothing.** No Stripe, no invoices, no billing product. Just the free pilots and a written end date. |
| **5-25** | **Stripe Payment Links.** One recurring Price at €49/mo and one at €490/yr. Email each gym its link once. Stripe runs the renewal, the retries, the card-expiry emails and the receipt. Issue the fatura-recibo by hand on the Portal das Finanças. |
| **25-60** | Add **InvoiceXpress** or **Vendus** (AT-certified; InvoiceXpress cert #192, Moloni #2860, both Visma-owned since 2023/2024) and connect Stripe so the certified invoice issues itself. Buy this step when manual invoicing stops being twenty minutes. |
| **60+** | Now consider self-serve signup inside matops, VAT registration, and everything deliberately skipped above. |

### Bank account

Stripe Portugal pays out to an IBAN. Use a **real Portuguese bank account**.
Wise's EUR IBAN is Belgian and occasionally causes friction with Portuguese tax
reporting and with Stripe's own checks. Not worth discovering during a first
payout.

---

## Part 2 — The founders dashboard should not be built

Three reasons. The first is architectural, not economic.

### 1. It punctures the one thing matops guarantees

Every read in matops runs inside a transaction pinned to a single academy by
Postgres RLS. The entire safety story of the product is *there is no unscoped
read path*. A cross-academy admin view is, by definition, an unscoped read path.
It adds the exact hole the tenancy design exists to prevent, in order to answer
questions that can currently be answered from memory.

`CLAUDE.md` already lists super-admin under parked deferred domains. That parking
is correct and should stay.

### 2. Stripe is already the business dashboard

MRR, active subscriptions, churn, failed payments, revenue by month. All free,
all present the moment the first payment is taken. At 15 customers that is a
complete picture of the business side. A custom dashboard would add nothing but
maintenance.

### 3. For product usage, SQL is the tool

Neon gives a direct psql connection. One query answers "which academies had a
booking in the last seven days." When it needs to look nice, point **Metabase or
Grafana at a Neon read replica** using a read-only role. That runs entirely
outside the application, so it never touches the RLS seam and never ships a line
of admin code.

### What to watch, and where it already lives

| Question | Where | Cost |
|---|---|---|
| Am I making money? | Stripe Dashboard | €0 |
| Did a card fail? | Stripe emails you | €0 |
| Which gyms are actually using it? | One SQL query against Neon | €0 |
| Which gym is about to leave? | Same query: last booking date per academy | €0 |
| Is anything broken? | Vercel logs, plus add Sentry | €0 |

**The one number to keep by hand:** *weekly active academies* — an academy with
at least one booking or attendance mark in the last seven days. A 15-row
spreadsheet beats any dashboard at this size, and updating it by hand forces you
to actually look, which a dashboard does not.

**The counter-metric:** paying academies versus active academies. The gap between
those two numbers is churn arriving early. A gym that stopped using matops in
February cancels in May.

**This one applies during the pilot already.** Weekly active academies is the
only number that says whether the pilot is working, and it costs one SQL query.

### When to revisit

When you can no longer name every academy from memory, or when someone other than
you needs an answer. Realistically **25 to 40 academies**.

At that point build a **read-only** ops page: a separate database role with no
write grant, hard-allowlisted to your own user id, no mutations of any kind.

**Never build "view as this academy".** It is the single most-abused feature in
multi-tenant SaaS, it destroys the tenancy guarantee the whole build establishes,
and every support problem it solves can be solved by asking the owner for a
screenshot.

---

## When to reopen this file

- A pilot academy is about to start paying.
- The pilot end date is within two months.
- Academy count passes 25, which triggers both the invoicing-automation rung and
  the ops-page question.
- Annual turnover approaches €15,000.

## Sources

- [Recibos verdes guide 2026](https://worktugal.com/recibos-verdes-portugal-guide/)
- [Artigo 53, IVA exemption rules 2026](https://calculariva.pt/taxas-regras/regime-isencao-art53/)
- [Portugal VAT rates and compliance 2026](https://www.numeral.com/blog/portugal-vat-rates-and-compliance)
- [Paddle vs Stripe vs Lemon Squeezy 2026](https://www.artisangrowthstrategies.com/blog/paddle-vs-stripe-vs-lemon-squeezy-2026)
- [InvoiceXpress](https://invoicexpress.com/en/) · [Moloni](https://www.eurotoolkit.eu/moloni) (AT-certified invoicing)
