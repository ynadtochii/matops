-- The gym's bank account belongs to the ORGANIZATION (ADR 127). One shared
-- membership covering a mat and a gym is paid once, into one account, so a
-- per-branch account is a question with two answers and no right one.
--
-- No policy and no grant: `membership_policy` already carries
-- `membership_policy_isolation` on `app.organization_id` and all four
-- `matops_app` grants from `0052`, and a new column inherits them.
ALTER TABLE "membership_policy" ADD COLUMN "bank_details" text DEFAULT '' NOT NULL;
