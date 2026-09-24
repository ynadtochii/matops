# 138: Reception class check-in

Date: 2026-09-11

Status: implemented locally. Tests and real iPad verification remain pending.

## Decision

An owner leaves a shared browser at reception. Members search their own name and tap to check into a class. This records attendance without requiring a member login. It does not verify identity.

Walk-ins use the existing form and lead workflow. The owner works with them in Walk-in leads. Keep the current fields, acknowledgements, class choices, phone matching, and visitor outcomes.

## Access

Use an expiring device token rather than an owner session. A same-origin activation route checks a fresh management session and branch permission. It signs out the browser before setting a separate HttpOnly cookie and opening reception through a full navigation.

The existing verification table stores the hashed token, branch ID, and next branch-local midnight. Reception operations validate that row on every request and reject account sessions. Owners and managers can revoke the branch’s reception tokens. No new database table is needed.

Member reads and writes use a transaction restricted to the stored branch. Search returns at most five names with an ambiguous-name flag. It never returns contacts, payments, or notes. The visitor endpoint uses the existing branch-pinned submission helper.

## Attendance and privacy

Use the existing member admission rules, not the staff walk-in override. Share the check-in write with account self-check-in. Take the existing branch schedule lock before the class lock. This matches booking order and prevents duplicate reception requests from consuming multiple places. Advance the schedule revision when check-in creates a booking.

Clear personal input and query state after success, inactivity, and background navigation. Keep explicit manual reset controls. Disable browser form autofill in reception only. Browsers may handle autofill and history differently, so a real iPad check remains required.

Use dedicated reception rate limits rather than the public form’s five submissions per ten minutes. Keep the current in-process limiter. Do not log reception request payloads or return cacheable search responses.

## Verification

Focused tests cover token expiry and revocation, branch isolation, name search, duplicate names, repeated attendance, membership gates, and existing visitor leads. They are written but have not run. Lint and typecheck are recorded in the feature plan.

See [the implementation plan](../reception-checkin-plan.md) for acceptance checks and the pilot.
