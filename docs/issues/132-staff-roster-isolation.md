# 132: Staff access stays separate from student membership

Date: 2026-09-06. Implementation follows the approved staff isolation plan.

## Problem

Branch identity records hold both staff and students. Some readers treated every record as a paying student.
Owners and instructors appeared in Members, received false coverage warnings, and could lose bookings during overdue cancellation.

## Decision

Keep existing identity records and their IDs. Role, approval status, and access source remain separate answers.
Members lists students. Staff lists owners, managers, instructors, and pending instructor requests, including inactive staff.
Organization owners and managers appear through inherited access without creating branch student records.

Active staff can train at their branch without a membership. Actual class participation still counts toward room capacity.
Teaching does not create participation. Attendance displays current role without rewriting historical marks.
An instructor who studies at another branch follows that branch's student membership rules.

Staff classification does not grant permission. Active status still controls local staff access.
Organization owner and manager access follows the existing organization authority rules.
The shared staff-access reader protects booking review and overdue cancellation as well as roster standing.
Cancellation locks existing role records and checks staff access inside its transaction.

Staff lifecycle controls stay on Staff. Moving an instructor to Members is an explicit action.
That action grants no paid membership. Existing records and payment history stay intact.
Inherited organization access cannot be removed through a branch status action.

New membership assignments must have a purpose outside the person's staff branches.
Existing assignments are not cancelled automatically. A plan may still cover student access elsewhere.
The person profile identifies staff-only plans for review. Existing charges and payment history remain visible.
The read-only SQL report lists active assignments with staff branches, other branches, and future bookings.
No billing cleanup or database migration runs with this change.

This replaces the claims in ADR 127 and its spec notes that staff need paid coverage.

## Verification

Regression cases cover staff classification, inactive staff, inherited access, student-only lists, and cross-branch cancellation.
Tests were written but not run, following the user's session rule.
Workspace typecheck passed 17/17 and lint passed 15/15. Browser acceptance and database report execution remain unverified.
