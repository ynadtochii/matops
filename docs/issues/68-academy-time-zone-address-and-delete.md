# 68 · The academy gets a time zone, an address, and a delete

_(Spec **O6** / **O3** / **S2** / **S7**. Fills the Settings screen ADR [63](63-settings-split-by-job.md) emptied out. Migration **`0021`** adds three nullable columns to `organization`. Writes stay on the base connection, per ADR [66](66-identity-reads-run-on-the-tenant-transaction.md).)_

## Context

After ADR 63 moved every job-specific control to the screen that owns it, Settings held two things: a mutable name and a permanent 6-digit code. The gaps that left are not cosmetic.

**No academy time zone existed anywhere.** Spec §4 has always said "every academy has one; classes render in it", but nothing stored one. Each class template carried its own `time_zone`, defaulted in the browser from `Intl.DateTimeFormat().resolvedOptions().timeZone` and typed into a free-text input. `academyTimeZone()` then guessed the academy zone by counting which zone the templates used most, falling back to `"UTC"`. Three failures follow from that:

- A typo ("Europe/Kyv") is stored without complaint and mis-times every class the template materializes.
- A coach creating a template on a laptop set to another zone silently splits the schedule across two zones.
- A brand-new gym has no templates, so its stats, streaks, and week boundaries are drawn in UTC until the first template exists.

**No address existed either.** A student who joins by 6-digit code sees a name and nothing else, and has no way to look up where the gym is from the app.

**Nothing could be removed.** A beta prospect who creates "Test gym" carries it in the post-login gate forever.

## Decision

Three nullable columns on `organization`, next to `public_code`, which set the precedent for academy data on the Better Auth table: `time_zone`, `address`, `deleted_at`.

### Time zone

Stored on the academy and picked from a `<select>` built from `Intl.supportedValuesOf("timeZone")`, so an unresolvable zone cannot be typed. `academyTimeZone()` reads the setting first, then falls back to the old most-used-template query, then to UTC — an academy that predates this setting is never re-timed to UTC by the upgrade.

**Changing the setting does not re-time existing templates.** Re-timing would run the ADR [60](60-backend-review-fixes.md) cancel-and-re-materialize path, which means one dropdown change could cancel classes students have already booked. Instead a new template inherits the academy zone, an existing one keeps its own, Settings names any template zone that disagrees, and the template form offers a "Move to `<zone>`" button so the owner moves it on purpose.

The template form no longer asks for a zone. It shows the one in force and says where it comes from.

### Address

One free-text block, up to 200 characters, sanitized by the same `blockText` cleaner as the bank details (ADR [58](58-input-validation-and-sanitization.md)). Not structured, not geocoded: gyms in different countries write addresses differently, and a plain search link is the only honest thing to open for a string we never verified. `academyMapUrl` builds a Google Maps **search** URL from it.

It shows in three places, all of them moments where someone needs to know where to go: Settings (edit), the mobile Profile tab under "Current academy" with an Open in Maps link, and the join confirm step on both clients, so nobody joins the wrong gym by mistyping a digit.

### Delete

**Soft delete, gated by a typed phrase.** The owner types `delete <academy name>` — naming the gym, so this cannot be done to the wrong one by muscle memory. The phrase match folds case and inner whitespace, because the point is deliberate intent, not transcription.

Soft rather than hard for two reasons. The 6-digit code must never be reissued to a different gym: a student who kept the old number would otherwise land somewhere unrelated. And a beta owner who deletes the wrong academy needs an undo, which is one `UPDATE` while the rows are still there.

The cost of soft delete is that every path resolving an academy has to filter it, and a missed filter leaks a dead gym. There are seven, all in `packages/db`:

| Path                                                | What it gates                            |
| --------------------------------------------------- | ---------------------------------------- |
| `getMembership`                                       | the whole tenant seam — every authenticated procedure |
| `listMembershipsForUser`                              | the switcher, the post-login gate, `academy.current` |
| `findAcademyByCode`                                   | join by 6-digit code                     |
| `getAcademyCode`                                      | the code display                         |
| `resolveInviteToken`                                  | the public join link                     |
| `getAcademyPublic`                                    | the public drop-in page                  |
| `claimDueDuesReminders` / `claimDueReminderClasses`   | both cron sweeps, so a deleted gym sends nothing |

`getMembership` is the load-bearing one: it now inner-joins `organization`, so a deleted academy fails every tenant procedure at the middleware whatever the session still holds. The deleting owner's session keeps its stale `activeOrganizationId`, which needs no cleanup — `academy.current` returns null and the app shell already renders the post-login gate for exactly that case, which is also what every other member gets.

## Consequences

Settings is three sections instead of one: identity, location, danger zone. Spec §O6 grows accordingly, §O3 records that a template inherits the academy zone, and S2/S7 record the address.

`academyTimeZone(tx)` becomes `academyTimeZone(ctx)` — it needs the academy id to pin the `organization` row, which carries no RLS policy. Migration `0020` revoked `UPDATE` on `organization` from `matops_app`, so the settings and delete writes run on the base connection; the reads inside a tenant resolver take `ctx.db`, per ADR 66.

Nothing about restore is in the product. Undoing a delete is `UPDATE "organization" SET deleted_at = NULL WHERE public_code = '…'`, run by whoever has database access. A restore UI, an export before delete, and a hard purge after a retention window are all deferred until a real gym asks.
