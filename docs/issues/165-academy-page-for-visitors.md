# 165 · Academy page for visitors: info and two weeks of classes on the drop-in token

**Status:** accepted, built (tests written, not run; `0022` applied to dev 2026-11-16, not production) · **Date:** 2026-11-16 · **Area:** `packages/domain` (`dropin.ts`), `packages/db` (`entity-schema.ts`, `academy-settings.ts`, migration `0022_visitor_page`), `packages/validators` (`fields.ts`), `packages/api` (`router/dropin.ts`, `router/academy.ts`), `apps/nextjs` (`academy/[token]`, `visitor-page-settings.tsx`, `invite-link-card.tsx`, `class-drop-in-link.tsx`), `apps/expo` (`class-share.tsx`) · **Changes in part:** [147](147-drop-in-link-booking.md) (class link window, what a visitor sees)

## Context

When someone first asks the owner about training, the owner types out times, prices, the address and the rules by hand, then sends the drop-in link. The drop-in form shows only three days of class titles. There is no page that answers "what is this gym and when can I come".

ADR 142 removed the public booking page (`/book/<code>`) because the owner did not want it in the first release. This page is not that page: it books only through the existing drop-in flow and makes a lead, never a member.

## Decision

1. **One page, on the drop-in token.** `/academy/<token>` uses the live drop-in link token. There is no new token or table. Rotating the drop-in link also turns off the old page link. The page reads `?by=` and passes it on, so sharer credit (ADR 151) works the same way.
2. **What it always shows.** The academy name and icon, and this week and next week (Monday to Sunday in the academy's time zone). It shows only the classes a visitor can still book: scheduled and not yet started. Days with no class are left out. Each class shows its time, length and title. There is no coach name, no capacity and no booking count.
3. **What the owner chooses to show.** Five plain-text fields: About, Prices, Your first visit, Rules, Contact. An empty field hides its section. The address shows only when the owner turns on "Show the address" (off by default), because the address already exists for other uses. Owners and managers edit this in Settings, under "Academy page" (`academy.visitorPage`, `academy.updateVisitorPage`). Prices are free text, not plan data, because the live academy has payments off and may have no plans.
4. **Booking.** Each class has a Book button that opens the existing class link `/drop-in/<token>?class=<id>`. The form, questions, agreement, lead dedupe, rate limits and soft capacity do not change.
5. **The class link reaches the end of next week.** `VISITOR_LINK_DAYS` (7) is replaced by `visitorLinkDays(now, tz)`: the local days from today to next week's Sunday (8 to 14). Without this, a class late next week shown on the page would be refused at submit. The list without a class keeps three days.
6. **Layout.** The owner's info comes first. The two weeks of classes sit last, under a "Book a class" section that starts closed, so the page reads as information and booking is one tap away.
7. **Public read.** `dropIn.page` is a `publicProcedure` with the same token check, base-connection pinning and 30-per-minute limit as `dropIn.resolve`. It returns the hidden fields as `null`, not just hidden in the UI.

## Consequences

- A class link that a student or coach shares now works for up to 14 days, not 7. The share button shows for the same longer range.
- Anyone with the link sees the owner's text and two weeks of class titles. That is the point of the page. Coaches' names stay private.
- The page is `noindex`. It is not a public listing of gyms.
- Instructors can copy the page link next to the drop-in link but cannot edit the text.
- No Expo screen. The app only got the longer class link window.

## Database

Migration `0022_visitor_page` adds five nullable text columns to `entity` (`visitor_about`, `visitor_prices`, `visitor_rules`, `visitor_first_visit`, `visitor_contact`) and `visitor_show_address boolean not null default false`. Structure only, no backfill. **Rollback:** revert the code and leave the columns.

## Addendum 2026-11-16: the gym's own zone, the gym's own name

- **Time zone.** An academy made before `/start` asked for a zone has `entity.time_zone` null. The signed-in app already fell back to the zone most of the academy's class templates use, but the token pages (drop-in, academy page, desk) fell back to UTC, so a Lisbon gym showed "UTC time" and would show class times one hour early in summer. `academyTimeZone(academyId, stored, exec)` in `packages/db/src/academy-settings.ts` is now the one rule: the saved zone, else the most used template zone, else UTC. `resolveDropInLink`, `resolveDeskLink` and the signed-in `academyContext` all call it.
- **Additional info.** A sixth optional field, shown last, for anything that fits nowhere else (parking, showers, kids). Migration `0023_visitor_more` adds `entity.visitor_more`.
- **No MatOps logo** on the academy page. The academy's icon and name are the header, so a visitor sees the gym, not the software.
