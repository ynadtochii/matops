-- Four indexes for reads that had none. Each one names the query it serves:
--   member_by_user     listAcademiesForUser filters member.user_id alone, and
--                      member_by_org_user is (organization_id, user_id), so its
--                      leading column is the wrong one. Runs on every academy
--                      switch and every mobile sign-in.
--   md_by_next_due     the dues-reminder claim scans member_dues by next_due_at
--                      across every academy.
--   cl_reminder_due    the class-reminder sweep wants unreminded classes in a
--                      time window. Partial, so it holds only classes still
--                      waiting: an already-reminded class leaves the index for
--                      good, and the index does not grow with history.
--   ct_sweep_stale     the materialization sweep is cross-academy, so the
--                      academy-first ct_by_academy_status cannot serve it.
-- All four are cheap: three of the four queries are cron sweeps that scan the
-- whole table today. See docs/backend-architecture-plan.md item 6.

CREATE INDEX "member_by_user" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "md_by_next_due" ON "member_dues" USING btree ("next_due_at");--> statement-breakpoint
CREATE INDEX "cl_reminder_due" ON "class" USING btree ("starts_at") WHERE reminder_sent_at IS NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "ct_sweep_stale" ON "class_template" USING btree ("status","generated_until") WHERE deleted_at IS NULL;