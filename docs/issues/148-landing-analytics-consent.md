# 148 · Landing page analytics with a consent banner

**Status:** accepted (built) · **Date:** 2026-09-30 · **Area:** `apps/nextjs` (`app/page.tsx`, `_components/landing.tsx`, `_components/consent-banner.tsx`, `_components/policy-text.tsx`, `lib/consent.ts`, `lib/site.ts`)

## Context

The signed-out landing page at `/` needs visit data to see how people find MatOps. The privacy notice promised no analytics cookies, and the first academies are in the EU, where analytics cookies need consent first.

## Decision

1. **Google Analytics 4 (`G-FX62B9MRFV`) on the landing page only, in production only.** It loads through `GoogleAnalytics` from `@next/third-parties`. The signed-in app, sign-in, start, join, drop-in and privacy pages load no analytics, because the app holds member names, phones and health notes.
2. **Consent Mode v2, advanced.** A `consent default` runs before the GA config: `analytics_storage` follows the visitor's saved choice and is `denied` when there is none. `ad_storage`, `ad_user_data` and `ad_personalization` are always `denied`. With consent denied, GA sets no cookies and sends anonymous pings that GA4 uses for modelled data.
3. **A minimal banner.** One sentence, a Privacy link, and Accept and Decline as buttons of the same size and style. No preference screen: there is one purpose. "Cookie settings" in the landing footer reopens it. Accept sends `consent update` granted. Decline sends denied and deletes any `_ga` cookies.
4. **The choice lives in the visitor's browser.** A first-party cookie `matops_consent=<granted|denied>.<version>.<date>`, six months, `SameSite=Lax`, `Secure` on https. The server reads it, so the banner does not flash for someone who has already chosen and GA starts in the right consent state. Bumping `CONSENT_VERSION` asks everyone again. No database and no server log.
5. **The privacy notice lists every cookie**: sign-in, the consent cookie, and GA's `_ga` cookies after Accept, with Google as processor and 14 months retention.

## Consequences

- Some EU authorities object to the cookieless pings sent before consent. Switching to basic mode means loading `GoogleAnalytics` only when the choice is `granted`.
- The GA4 property must match the notice: data retention 14 months, Google signals off, ads personalization off, data processing terms accepted.
- The consent state cannot be checked in dev or preview, because GA only renders in production. Check it with GA4 DebugView after the deploy.
