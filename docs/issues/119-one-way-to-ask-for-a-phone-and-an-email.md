# 119 — One way to ask for a phone and an email

**Status:** accepted · **Date:** 2026-08-30 · **Area:** `packages/domain` (`src/phone.ts`), `packages/validators` (`src/fields.ts`), `packages/db` (migration `0041`, `src/dropin.ts`, `src/invite.ts`, `src/academy-code.ts`, `src/membership.ts`, `src/public-api.ts`, `src/academy-settings.ts`), `packages/api` (`src/academy-tz.ts`, `src/router/academy.ts`, `src/router/dropin.ts`, `src/public`), `apps/nextjs` (a new `_components/form-fields.tsx`, the Settings location card, plus seven call sites). **Relates to:** [25](25-dropin-lead-form.md), [58](58-input-sanitization.md) (the field primitives this builds on), [115](115-public-booking-api-and-the-lead-path.md) (the phone match), [118](118-the-owner-makes-the-account.md) (the email is now an account).

## Context

Six web forms captured a phone number and five captured an email, and each one
built its own field. That is how one of them ended up asking for an email it
marked optional while another required it, and it is why the same person's
number is stored six different ways.

Phone had three formats in play at once:

| where | format | set by |
|---|---|---|
| `PhoneSchema` | charset regex, at least 5 digits, punctuation kept | `fields.ts` |
| `drop_in.phone` | digits only, and the dedupe key `(academy_id, phone)` | `normalizePhone` |
| `user.phone` | whatever the person typed | `updateUserProfile` |

The last two disagree, and `phoneMatchKey`'s last-nine-digits compare (ADR 115)
exists only to bridge them. Email was already one schema and one rule, so what
it lacked was the asking, not the validating.

## 1. E.164, and where the strictness stops

`PhoneSchema` now strips punctuation and keeps a leading plus, so
`+351 912 345 678` and `+351-912.345.678` are one stored string. A value that
carries a country code is held to **E.164**: a plus, a non-zero first digit,
8 to 15 digits.

A value with **no** plus keeps the older, looser rule. That is deliberate and
temporary. The Expo app still posts what the person typed, and tightening this
before its four fields are rebuilt would lock every mobile member out of their
own profile. Web sends E.164 today; the loose branch dies with the mobile
slice.

## 2. No phone library

`libphonenumber-js` is the right tool for per-country length and prefix rules
and it costs 75-145 kB. The shared bundle floor is already the largest thing on
the frontend budget (roadmap B.5: 1419 kB of a 1555 kB first load is shared).
With the country picked explicitly from a list, the E.164 shape carries enough,
and the library drops in behind `PhoneSchema` later without touching a call
site.

The one place this shows is the **national trunk zero**. `toE164` drops a
leading zero, which is right for the UK, Germany, France, the Netherlands,
Australia and South Africa, and wrong for an Italian landline, which keeps its
own. A gym collects mobile numbers, so the trade is worth naming rather than
guessing at per-country rules we cannot check.

## 3. The country the picker opens on

`organization.country` (migration `0041`, nullable ISO 3166-1 alpha-2) is what
the owner says, set once in **Settings → Country**. Failing that,
`ZONE_COUNTRY` in `packages/domain/src/phone.ts` maps the academy's IANA zone:
`Europe/Lisbon` to Portugal. An unmapped zone falls back rather than guessing.

`academyCountry(country, zone)` is that order, in one place. The zone is a good
guess and nothing more: zones are shared across borders, our map covers ~70
countries and not the rest, and a gym near one should be able to say so once
instead of correcting the picker on every form. The setting shows the guess as
the current value and says it is a guess until it is saved.

`DIAL_COUNTRIES` is ~70 countries, not all of them: Europe, the Americas and
the places members commonly come from is the part that earns its bytes, and the
list is sorted by name because that is the order the picker shows. A test
asserts that ordering, so a country added in the wrong place fails rather than
appearing in the middle of the list.

Three reads gained the zone so the unauthenticated forms have one:
`getAcademyPublic`, `resolveInviteToken` and `findAcademyByCode`. The public
REST `/academy` already returned it and the deny list (ADR 115) already lists
the zone as public, so nothing new is exposed.

## 4. Two components, seven call sites

`apps/nextjs/src/app/_components/form-fields.tsx`:

- **`PhoneField`**: a country picker beside the number, emitting E.164 upward.
  The country is local state rather than re-derived from the value on every
  keystroke: while the number box is empty there is no E.164 to read a country
  out of, and a picker that snapped home mid-edit is worse than one that stays
  where it was put. An optional `name` rides a hidden input, because two forms
  reach a server action through `FormData` and the visible box holds only the
  national part.
- **`EmailField`**: one field, one rule, with the domain completed after the
  `@` by a native `<datalist>`. The browser owns the popup, the keyboard and
  the touch behaviour, so there is no dropdown to build and nothing to dismiss.

Call sites: the profile edit, the invite join (both its sign-up and its profile
step), the code join, the walk-in visitor row on the roster, the wall-QR
drop-in form, the public `/book/<code>` page, the sign-in form, and the promote
dialog from ADR 118.

## Out

- **Defaulting the country from the browser.** `navigator.language` says what
  the person reads, not where the gym is, and a visiting student would move the
  picker for everybody. The academy is the right source.
- **Mobile.** The four Expo fields (`join/[token]`, `onboarding` ×2,
  `profile`) keep what they have. They need native twins, there is no simulator
  here, and §1's loose branch exists precisely so they keep working until then.
- **Backfilling the rows already stored.** Every existing `user.phone` and
  `drop_in.phone` would need a country guessed for it, which is wrong for any
  member with a foreign number, and `drop_in`'s unique index on
  `(academy_id, phone)` could collide mid-backfill. New writes are E.164 and
  the last-nine-digits compare keeps bridging both, so the data cleans itself
  as people edit their profiles.
- **Retiring `phoneMatchKey`.** It stays until the rows agree. When they do, an
  exact compare replaces it.
- **Per-country validation and formatting-as-you-type.** See §2.

## 5. The bug this shipped with

`PhoneField` first computed its default country inside a `useState`
initializer. That runs **once**, on the first render, and on every form the
academy arrives from a query that has not resolved yet: the zone was null, the
fallback won, and the picker stayed on it after the real zone arrived. A gym in
Lisbon offered `+1 US`.

Only what the person did is state now. The country is `picked ?? (read back out
of the value, when it has one) ?? the academy's`, so a default that arrives
late is used, and a choice already made is never overruled.

## Consequences

- **Migration `0041`** adds `organization.country`, nullable, and nothing else.
  It writes no rows: existing academies read null and keep the zone guess until
  an owner sets one, which is the correct answer for every academy whose zone
  the map covers. The optional fill for the ones it does not is
  `packages/db/scripts/2026-08-30-academy-country.sql`, run by hand and **run on
  Neon** 2026-08-30: it set Alma beta to `PT`, the same answer its
  `Europe/Lisbon` zone already guessed, so the row now states the country rather
  than implying it. A second run wrote nothing.
  Migrations are structure only from this slice on (delivery.md §5).
- The public `GET /academy` gains `country` (see [public-api.md](../public-api.md)).
  It is additive, and the deny list already treats the gym's location as public.
- `drop_in.phone` is unchanged: `normalizePhone` still strips the plus, so the
  dedupe key and everything reading it behave exactly as before. What changes
  is that web-captured numbers now always carry their country code into that
  key, where before they carried one only if the person typed it.
- A number typed into a web form and one typed into the Expo app are still two
  strings until the mobile slice lands. `phoneMatchKey` covers the case that
  matters, which is a lead becoming a member.

## Amendment (v6.9): the plus is kept in `drop_in.phone`

The consequence above said storage was unchanged. That was the conservative
call and it was wrong on one point, found in a review of this wave.

`drop_in.phone` is not only the dedupe key. It is also the number the owner
reads off the leads screen and dials back. Stripping the plus made those two
jobs disagree: every web form now produces E.164, and the row kept
`351912345678`, where `351` could be a country code or an area code and the
reader cannot tell which.

`normalizePhone` now strips the formatting and keeps a leading plus. The
dedupe key still collapses two spellings of one number, `canSubmitDropIn`
counts digits directly so its three-digit floor did not shift, and
`phoneMatchKey` was never affected because it strips non-digits itself.

The backfill this note said it wanted to avoid is still avoided: no migration,
and the fill in `packages/db/scripts/2026-08-31-lead-phone-plus.sql` only
prefixes a row whose digits start with the dial code of the country already on
`organization.country`. It guesses nothing. A row it cannot read that way keeps
the old shape and may open a duplicate lead on the visitor's next form, which
is a merge an owner can do; writing the wrong country onto a phone number is
not.

The Expo app still posts what the person typed, so `phoneMatchKey` stays.
