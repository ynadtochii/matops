# 146 · Student sign-up answers: belt, health note, email opt-in and a waiver

**Status:** accepted (slices A and B built) · **Date:** 2026-09-27 · **Area:** Join (web), Settings, Students, Profile, notifications

## Context

A pilot owner asked to collect more when a student joins: their belt, any injuries or medical conditions, and agreement to a risk statement. Belt is useful for every academy. The health question and the waiver are specific to some gyms.

We looked at a general form builder, with answers stored as JSON. We rejected it for now:

- One owner asked. A builder is the bigger build, and we do not yet know which fields gyms want.
- Health answers are special category data under GDPR. A known field can be limited to staff and erased. A JSON answer cannot be told apart from the others.
- A waiver needs proof of which text the student accepted and when. A JSON checkbox does not give that.

If three or more gyms ask for different fields, we add up to five short custom questions per academy, answers in `jsonb`, never for health data.

## Decision: slice A (built)

The web invite-link join form (one screen, no steps) gets three student-only inputs. An instructor invite keeps the plain form. The Expo app's join by code is unchanged.

- **Belt.** Required, with no default, so a student cannot skip it and save White by mistake. The list is "Never trained", White to Black, then "Enquiring for a child". "Never trained" saves White with 0 stripes plus a sign-up note "Never trained before". "Enquiring for a child" saves no rank, only the note "Enquiring for a child". Stripes show only once a belt is picked. The student's pick is written straight to `member_rank` (BJJ), with the student as `updated_by`. There is no `rank_promotion` row: it is the starting belt, not a promotion. If a staff-set rank already exists, the student's pick does not overwrite it. A wrong claim is fixed with the existing Clear, then Set. This amends ADR 41, which kept rank out of registration.
- **Injuries and medical conditions.** Optional free text, shown only when the owner turns on **Ask about injuries and medical conditions** in Settings (`entity.signup_health_question`, default off). A non-empty answer is saved as one `member_note` with the student as author, so it lives where coaches already look, is limited to staff by the existing note router and RLS, and is removed by the existing erase. The staff panel labels it **From sign-up form**. The student cannot read it back, and tells the coach when it changes. The server drops the answer while the question is off. Answers are saved only when the join creates or reopens the membership. A second tap on Join while pending saves nothing. A student who rejoins after a rejection or removal gets a new note. This amends ADR 41, where only staff wrote notes.
- **Keep me updated on changes.** Optional, not ticked by default. Stored as `entity_membership.email_updates_at` (null means no). The student can change it on web Profile (**Emails**). It controls optional gym news only. Approval and class notices are service messages and go to everyone. There is no news sender yet: the consent is stored for when one exists.
- **Approval email.** Approving a member now also sends one email through Resend with the same text as the welcome push. It never blocks the approval, and it does not depend on the news opt-in.

The pure rule is `signupWrites` in `@matops/domain/signup`. The write is `saveSignupAnswers` in `@matops/db/signup`, run in a scoped transaction for the joined academy after the pending membership exists.

### Database

Migration `0007_signup_questions` holds both slices. For slice A it adds `entity.signup_health_question boolean not null default false` and `entity_membership.email_updates_at timestamptz`. Everything in it is additive, so it is safe while the old build still serves.

## Decision: slice B (built)

- **The owner writes the agreement** in Settings, starting from `waiverTemplate(academyName)` in `@matops/domain/signup`. The text and its legal effect belong to the gym, not matops. **Save agreement** (`academy.saveWaiver`, owner or manager) adds a row to `academy_waiver` only when the text changed. The newest row is the current version. Rows are never edited.
- **Require agreement** (`entity.waiver_required`, default off) can only be turned on once a text exists. While it is on, `invite.resolve` returns the current version's id and text.
- **The join form** shows the text in a scrollable box with a required "I have read and agree" tick. The form sends the version id it showed. `signupWrites` refuses a missing id and an id that is no longer current, so the saved acceptance is always the text the student read. After a refusal the form reloads the invite and clears the tick, and keeps what the student typed.
- **Acceptance** is saved in the same scoped transaction as the other answers, as one `waiver_acceptance` row (member, version, time). Staff see **Agreed {date}** on the student's Overview.
- **Only new students joining by invite link are asked.** Existing, imported, code-joined and owner-added students are not. A later slice may block booking until they accept the current version, and may ask again after an edit.
- **Erase** deletes the member's acceptance rows with the rest of their data. The agreement versions are the academy's own and stay.

### Database

For slice B, migration `0007_signup_questions` adds `entity.waiver_required boolean not null default false` and two academy tables with RLS on `academy_id`. `academy_waiver` has SELECT and INSERT for `matops_app`. `waiver_acceptance` has SELECT, INSERT and DELETE (DELETE for the erase), and no UPDATE, so an acceptance cannot be changed. A composite foreign key ties each acceptance to a version of the same academy. The unique index on `(academy_id, id)` is created before that foreign key, by hand, because drizzle-kit generated them in the wrong order. Seed teardown and `wipe-academies.sql` delete both tables.

## Addendum 2026-09-27: agreement grants

The `GRANT` lines in `0007` did not limit `matops_app`. `0000_baseline` sets default privileges, so every new table already had SELECT, INSERT, UPDATE and DELETE. Migration `0008_waiver_append_only` revokes UPDATE and DELETE on `academy_waiver` and UPDATE on `waiver_acceptance`. `verify` now expects exactly these grants on the two tables. A future table that must not get all four grants needs its own `REVOKE`.
