# Infra costs + vendor lock-in (v1 pilot)

*Vendor free-tier limits and switch costs, gathered before the first real-gym
test. Numbers are mid-2026, from each vendor's official docs. Re-verify at signup
— free tiers drift. Feeds ADR [46](issues/46-no-scheduler-v1.md).*

## Bottom line

For **one gym, internal test**, the free tiers of **Neon, Resend, and Expo/EAS
all fit comfortably**, and the RLS-over-`pg` architecture runs on Neon Free
unchanged. Two things force money, one is a trap:

- **iOS students → $99/year Apple Developer account.** Hard requirement even for
  internal installs. **Android is $0** (APK via EAS internal distribution).
- **Vercel Free (Hobby) forbids commercial use, and "requesting payment from
  visitors" counts** — the dues screen. A live gym on Hobby breaks the terms. Fix:
  self-host (Railway / Render / Fly, no such clause) or Vercel Pro $20/mo.

Lock-in is **low across the stack** — using **Neon, not Vercel Postgres**, is the
single best lock-in decision. Heaviest tie was **Vercel Cron** — removed in v1
(ADR 46).

## Free-tier fit (one gym)

| Vendor | Free fits? | Key free limits | First paid step |
|---|---|---|---|
| **Neon** (DB) | ✅ easily | 0.5 GB storage · 100 compute-hrs/mo (~400 active hrs) · 5 GB egress — each **hard-suspends**, not throttles · sleeps after 5 min idle (~500 ms cold start) · pooled endpoint + `pg` interactive tx **work on Free** | Launch, pay-as-you-go ~$0.106/CU-hr + $0.35/GB-mo |
| **Resend** (email) | ✅ | 100/day · 3,000/mo · 1 custom domain · SPF/DKIM/DMARC **free** · 10 req/s | Pro $20/mo (removes 100/day cap, 50k/mo) |
| **Expo/EAS** (mobile) | ✅ | ~30 builds/mo (15 iOS+15 Android) · push **free**, no cap · internal distribution · 1,000 update MAU | Starter $19/mo (priority builds) |
| **Better Auth** | ✅ always | library, self-hosted, no vendor | never |
| **Apple** (iOS install) | ❌ | no free path for real devices | **$99/year** |
| **Google Play** | n/a | APK install is free | $25 once (only to publish to store) |
| **Vercel** (web host) | ⚠️ commercial trap | 100 GB transfer · 5-min functions · **100 crons but Hobby cap = 1/day** · **non-commercial only** | Pro $20/seat/mo (commercial OK, sub-daily crons) |

## Lock-in ranking (best → worst)

1. **Better Auth** — none (our code).
2. **Neon** — near none (standard Postgres; `pg_dump` + `pg_dumpall --roles-only`
   for the `matops_app` role; RLS policies migrate cleanly).
3. **Resend** — near none (thin `packages/notifications` wrapper; real cost of a
   swap is re-doing DNS + re-warming reputation, ~1 day, not code).
4. **Expo/EAS** — low (local builds + direct FCM/APNs are escape hatches).
5. **Vercel** — low-moderate, and dropping now that Cron is gone. Avoid Cloudflare
   Workers as a target (non-Node runtime can break the `pg` RLS transaction);
   Railway/Render/Fly are near drop-in for our Node + Neon design.

## Two risks to plan for

- **Magic-link deliverability** (the login path). A fresh sending domain has no
  reputation → auth email can land in spam → users can't sign in. Mitigate: set
  SPF + DKIM + DMARC, use a **separate `login.` subdomain** for auth mail (so
  dues-reminder complaints never poison logins), start low-volume. Fallbacks:
  Brevo (300/day free) for volume, Postmark for best auth inbox rate.
- **Neon scale-to-zero** on Free: the first request after idle is ~500 ms slow.
  Fine for a gym; note it if latency looks odd.

## Payments positioning — "we don't process payments"

True (manual bank transfer, no card processor). Where it helps and where it does
not:

| Rule / gatekeeper | Does "no payment processing" help? |
|---|---|
| **Apple App Store (IAP / 30%)** | **Yes, strongly.** Gym membership is a real-world service, not digital goods — external payment is allowed, **no In-App Purchase needed**. Keep the mobile dues UI as *information* ("what you owe + how to pay"), never an in-app money button. |
| **PCI-DSS** | **Yes.** No card data touches us → zero PCI scope. |
| **Money-transmitter / legal** | **Yes.** We never hold or move funds — a record-keeper, not a processor. |
| **Vercel Hobby non-commercial** | **No.** The rule keys on *purpose* (financial gain of anyone involved), not the payment button — a revenue-generating gym is commercial even schedule-only. Repositioning the UI does not cure it. |

**So:** position payments honestly as "dues tracking, not payment processing" — it
wins the Apple + PCI + legal points. It does **not** make a Vercel Hobby deploy
compliant; move the money-making deployment off Hobby (self-host is cheapest and
de-locks) or buy Pro.

## Hosting decision (2026-07-23)

**Stay on Vercel.** Start on Hobby; **upgrade to Pro ($20/mo) reactively** if an
issue arrives (Vercel flags commercial use, a limit is hit, or a sub-daily cron is
wanted). Self-host stays the documented escape hatch (§ lock-in above,
architecture.md §9) but is **not** the plan for the pilot. Portability was kept
cheap on purpose, so this is a low-risk default.

Caveat kept honest: Hobby is non-commercial, and a live gym using the dues screen
meets Vercel's commercial definition from day one — so "if an issue arrives"
realistically means "if Vercel flags it." Enforcement is usually warned-first;
Pro removes the question entirely.

## Recommended pilot stack

- **Web:** **Vercel** — Hobby now, Pro ($20/mo) if flagged / a limit hits / a
  sub-daily cron is wanted (decision above).
- **DB:** **Neon Free.**
- **Email:** **Resend Free** on a dedicated `login.` subdomain (SPF/DKIM/DMARC).
- **Mobile:** **Android first, $0** (APK via EAS). iOS only when paying **$99/yr**.

**Start cost: $0.** **+$99/yr** for iPhones. **+$20/mo** for Vercel Pro when a real
gym runs live dues.
