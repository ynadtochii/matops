# 67 · A web Profile, reached from the sidebar footer

_(Web IA + one read, spec **O11** / **O6** / **S7**. Extends the "Settings is only the academy" line of ADR [63](63-settings-split-by-job.md). No migration. `academy.current` gains `joinedAt`.)_

## Context

The web had settings for the gym and nothing for the person running it. An owner or an instructor could not see or change their own name and phone anywhere in the browser: the only editor was the mobile Profile (S7), which a coach who never installs the student app never opens. The name is not decoration either. It is what students see on the schedule as the coach of a class, what the staff list shows, and what an approval queue reads.

The procedure already existed. `account.updateProfile` has been in the router since slice B.3, on `protectedProcedure` because a profile is one identity across every gym, and only the Expo app ever called it.

## Decision

**A `/profile` route, opened from the sidebar footer, not from a nav item.** The footer already showed the avatar, the name and the role. Making that block the link puts the account where a web app puts it, and costs no room in a primary nav that already carries seven items for an owner. On a phone the bottom tab bar is full, so the mobile top bar gains the same avatar as a link. Profile is a route with no nav item, the pattern O5 Attendance already set.

**Settings stays the academy, Profile becomes the person.** ADR 63 emptied Settings down to the academy name and code and left the reason in place: each control belongs to the job it serves. An account is a different job from a gym.

**It reuses `account.updateProfile` exactly.** Same three fields, same `UpdateProfileSchema` (sanitized in ADR 58), same read-only email, same reason: the email is the sign-in identity, and changing it is a re-verification flow, not a form field. No new procedure, no new permission tier, no schema change.

**The page reads the session on the server and refreshes it after a save.** `(app)/profile/page.tsx` is a server component that hands name / email / phone to the client screen, so there is no second session fetch and no `inferAdditionalFields` plugin on the web auth client. A successful save calls `router.refresh()`, which re-runs the layout, so the sidebar name updates with the screen.

**`academy.current` gains `joinedAt`.** "Member since" is the one fact on this screen the client did not already hold. `listMembershipsForUser` selects `member.createdAt`; the column is Better Auth's own and has been there since Phase 0, so nothing is written and no migration runs.

**Every role gets it, students included.** The screen asks for nothing owner-tier, and a student on the web (ADR 57) has the same sidebar footer.

## Consequences

Spec gains **O11**, and the "Owner web includes O1-O10" line becomes O1-O11 with the note that O11 is not role-gated.

Appearance and sign out appear twice: in the sidebar, where they were, and on Profile, where an account screen is expected to carry them. That is deliberate. Removing them from the shell would cost a click on the two controls people use from every screen.

The screen shows only the **active** academy. Someone on the switcher with two gyms sees the one they are in, which matches every other screen in the shell.

Out: avatar upload (no file storage in v1), email change, password / passkey management, notification preferences (the web has no push), and any student-visible coach bio.
