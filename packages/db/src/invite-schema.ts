import { sql } from "drizzle-orm";
import { pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { entity } from "./entity-schema";

/**
 * Shareable per-role invite links (spec O4, docs/issues/20).
 *
 * NOT a Better Auth invitation: those are email-bound + single-use accept →
 * active member, which fights our uniform pending gate. This is a plain
 * shareable, rotatable link that carries only the academy + the *intended* role;
 * it grants nothing until an owner approves.
 *
 * NO RLS on this table (unlike the scheduling tables). The join screen resolves a
 * token with no session and no active academy, so `invite.resolve` runs as a
 * public procedure on the base connection — it cannot run inside the tenant
 * transaction. Owner-side reads filter by academy id explicitly. This mirrors the
 * Better Auth tables, which also carry no academy RLS policy. The table holds no
 * tenant secret — only an academy id, a role, and an opaque token.
 */
export const academyInvite = pgTable(
  "academy_invite",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    // The `bjj_academy` entity this link joins (ADR 124). No cascade: teardown
    // and erase delete invites explicitly, and a cascade would hide the table
    // from the coverage tests that prove they do.
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    // The role granted AT approval: "student" | "instructor" (never "owner").
    role: t.text().notNull(),
    // Opaque URL-safe token shared in the link. Server-generated, never client-set.
    token: t.text().notNull().unique(),
    // User id of the owner who created the link (audit only, no FK cascade).
    createdBy: t.text().notNull(),
    createdAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
    // Set when rotated/revoked. A null value means the link is live.
    revokedAt: t.timestamp({ withTimezone: true }),
  }),
  (table) => [
    // At most one LIVE invite per (academy, role): rotate = revoke old + insert new.
    uniqueIndex("academy_invite_one_active_per_role")
      .on(table.academyId, table.role)
      .where(sql`${table.revokedAt} is null`),
  ],
);
