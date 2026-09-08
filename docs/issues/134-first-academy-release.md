# 134: First academy release

Date: 2026-09-07. Status: superseded by [ADR 135](/Users/kuna/projects/matops/docs/issues/135-first-academy-fresh-install-contract.md).

ADR 135 replaces this staged migration and worker design with a fresh install. Guardian access, student shopping, scheduled jobs, and the external booking API described below are not part of the current release.

## Problem

The first academy needs one reliable daily workflow. Several older boundaries made that hard.

Student records required login accounts. Branch dues and shared memberships both remained active. Organization and branch pages mounted different navigation owners. Class email could be lost after a successful class change. Scheduled work had no current run record. Import and full organization export did not exist.

## Decision

Use an organization-owned person as the student subject. A person may link to one login account. A child may name verified guardian accounts. Staff actions still record the acting account. Existing account-based subject columns remain readable during the hand-run person fill.

Use shared memberships as the only payment record. Keep branch payment enforcement as an independent option. Payment records say whether a month was marked paid. They do not claim that MatOps moved or verified money. Convert old plans, dues, claims, and settings with a separate dry-run script. Remove their tables in a later deployment after the new application is live.

Mount one application shell above organization and branch routes. Keep explicit branch IDs in branch URLs. Organization pages carry the selected branch in the `branch` query value. Both badge groups come from one authorized summary.

Owners and managers may change attendance older than 14 days when they give a reason. Instructors keep the 14-day limit. Every historical change records the actor, time, previous value, new value, and reason.

Write class-change email work to an outbox in the same transaction as the class change. A scheduled delivery job retries failures with a stable delivery key. Visitor confirmation links remain usable after booking and allow safe cancellation until expiry.

Run email delivery every five minutes. Run membership reminders, overdue cancellation, and calendar extension once each day. Record every run. Owners and managers see late jobs and exhausted organization email work without seeing another organization's counts or recipient details.

Give owners and managers an assisted student CSV import. Preview validates rows and finds possible duplicates. The commit repeats the checks and writes all included rows in one transaction. Full organization exports use bounded pages and include archived people, enrollments, guardians, memberships, payment records, attendance, and attendance corrections.

Make curriculum and referrals organization options that start off. Keep a single branch visible without a redundant picker.

## Database delivery

Migrations 0069-0073 change structure only. Existing account subjects move through `packages/db/scripts/2026-09-07-person-subject-backfill.sql`. Existing branch dues move through `packages/db/scripts/2026-09-07-legacy-dues-to-shared-memberships.sql`. Both scripts roll back unless `apply=true` is supplied.

Migration 0074 removes the old dues tables. It refuses to run while they contain rows.

The deploy migrator detects old dues rows. It applies only the backward-compatible expansion through 0071, then stops the deployment. Operators run both conversion scripts and review their reports. The next deployment applies 0072 and 0073 with the application cutover while the old tables remain available to the previous application version. A later deployment sets `ALLOW_LEGACY_DUES_DROP=1` and applies 0074 after the new application is live.

## Replaced rules

This supersedes ADR 40's branch dues storage, ADR 46's decision to leave schedulers detached, ADR 126 and ADR 127 where they preserve two payment models, ADR 128 where students require accounts, and ADR 133's pending attendance correction policy.

Existing rules for organization and branch data isolation remain. Losing coverage still cancels no booking. Overdue payment cancellation still applies only where the branch has payment enforcement on.

## Verification

Focused tests were written but not run, following the session rule. Package and workspace static checks must pass before release. Browser, device, production migration, privacy identity, and isolated restore checks remain release tasks.
