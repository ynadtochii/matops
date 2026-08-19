# 58. Every input is sanitized then bounded, in one place

**Status:** accepted
**Date:** 2026-08-19
**Supersedes:** nothing. Amends the boundary rules in [33](33-tenant-seam-enforcement.md).

## Context

Every tRPC procedure already had a Zod input schema, and all of them lived in
`@matops/validators`. That part was fine. What the schemas did not do was clean
the value before measuring it, and three input surfaces were not covered by a
schema at all.

Concrete problems found:

- **Names, titles and notes accepted invisible characters.** `z.string().trim()`
  keeps zero-width spaces, C0/C1 control characters, and the Unicode bidi
  overrides (`U+202E`) that make a stored value render in a different order than
  it was written. A member named with a bidi override reads one way in the roster
  and another way in an export.
- **Phone had no charset at all.** `z.string().trim().min(3).max(30)` accepted
  `<script>alert(1)</script>` and `call me`. The gym dials this field.
- **`proofUrl` used bare `z.url()`.** That accepts `javascript:` and `data:`
  URLs. Nothing renders the value as a link today, so this was a trap set for
  whoever adds the "view receipt" button.
- **The sign-in server actions validated nothing.** A server action is a public
  endpoint: anything the client binds can be posted directly with any value.
  `sendMagicLinkAction` passed an unbounded string as an email, and the
  `callbackURL` argument reached Better Auth unchecked.
- **The magic-link email interpolated a caller-influenced URL into an `href`.**
- **`UpdateClassSchema.timeZone` had no `isValidTimeZone` refine** on the
  optional reschedule path, unlike the two create schemas.
- **The schedule week window had no span limit**, so one request could ask for
  a decade of classes.

## Decision

Sanitize at the boundary, in the schema, then bound the cleaned value. Keep the
rules loose enough that real people pass and tight enough that a payload does
not.

`@matops/validators` gains a small set of exported primitives that every field
now composes from:

| Primitive | Rule |
| --- | --- |
| `lineText(min, max)` | drop invisibles, fold whitespace runs to one space, trim, then bound |
| `blockText(min, max)` | keep paragraphs, drop invisibles, cap blank runs at one, trim, then bound |
| `NameSchema` | `lineText(1, 60)` |
| `PhoneSchema` | loose on format, strict on charset: `+`, digits, space, `( ) - .`, at least 5 digits |
| `EmailSchema` | trimmed, lower-cased, then `z.email()` |
| `HttpUrlSchema` | `z.url()` with the scheme pinned to `http`/`https` |
| `IdSchema` | an opaque Better Auth id, bounded to 64 characters |
| `OpaqueTokenSchema` | an invite or push token, bounded to 200 characters |

Two details that are load-bearing:

- **Each primitive caps the raw string before it transforms it.** A megabyte of
  junk is rejected by the pre-transform `.max()` before any regex runs on it.
  The post-transform bounds are the real limits, measured on the cleaned value.
- **Sanitizing lives in the validator, not in the router or the client.** Both
  clients and the API import the same schema, so a mobile field and a web field
  cannot drift apart, and nothing has to remember to call a cleaner.

The three uncovered surfaces are closed with the same schemas:

- `sign-in-actions.ts` parses its `FormData` with `EmailSchema` / `NameSchema` /
  `PhoneSchema`, and pins `callbackURL` to a same-site relative path.
  `//evil.com` and `https://evil.com` both read as a URL to a browser, so an
  unchecked `callbackURL` is an open redirect that also puts attacker text
  inside the sign-in email.
- `join/[token]/page.tsx` parses the base64url profile carried in `?p=` with the
  same schemas the join mutation enforces, because that parameter is just a URL
  anyone can craft.
- `packages/auth` escapes the magic-link URL before it goes into an `href`.

## Consequences

- **Some previously accepted values are now rejected.** A phone of `"123"` or
  `"n/a"` fails on the next save. Stored rows are not re-validated, so nothing
  breaks until a member edits their profile. This is the intended tightening.
- **Input and output types stay identical** (`string` to `string`), so no client
  type changed and no migration is needed.
- **`@matops/validators` now runs vitest**, matching `@matops/domain`. The
  primitives are pure, so they are tested directly (`pnpm -F @matops/validators
  test`, 18 tests).

## Not done here

**Rate limiting.** The public procedures (`dropin.submit`, `invite.resolve`,
`academy.byCode`) and the magic-link server action are unauthenticated and
unthrottled. Validation bounds what one request may contain; it does not bound
how many requests arrive. That is abuse control, it needs a store, and it
belongs in Phase 5 launch hardening.
