-- Make the DELETE grant explicit on the two tables the permanent member erase
-- clears (docs/issues/84). This is a NO-OP on an existing database, and is kept
-- only because it is already applied and because it records the intent.
--
-- Both tables read as append-only in their own migrations: `member_referral_audit`
-- was granted `SELECT, INSERT` (0018) and `notification` "no DELETE grant: v1 has
-- no path that removes a notification" (0023). Neither actually withheld DELETE.
-- Migration 0001 sets `ALTER DEFAULT PRIVILEGES ... GRANT SELECT, INSERT, UPDATE,
-- DELETE ON TABLES TO matops_app`, so every table created after it starts with all
-- four, and a later narrower GRANT is additive and can take nothing away.
-- Append-only on those two tables was a convention, never a permission.
GRANT DELETE ON "member_referral_audit" TO matops_app;--> statement-breakpoint
GRANT DELETE ON "notification" TO matops_app;
