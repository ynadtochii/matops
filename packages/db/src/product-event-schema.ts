import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization } from "./auth-schema";
import { entity } from "./entity-schema";

export const productEvent = pgTable(
  "product_event",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    organizationId: t
      .text()
      .notNull()
      .references(() => organization.id),
    entityId: t.text(),
    kind: t.text().notNull(),
    name: t.text().notNull(),
    actorRole: t.text(),
    occurredAt: t.timestamp({ withTimezone: true }).defaultNow().notNull(),
  }),
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.entityId],
      foreignColumns: [entity.organizationId, entity.id],
      name: "product_event_entity_same_org",
    }),
    index("product_event_by_time").on(table.occurredAt),
    index("product_event_by_org_time").on(
      table.organizationId,
      table.occurredAt,
    ),
    uniqueIndex("product_event_milestone_once")
      .on(
        table.organizationId,
        sql`coalesce(${table.entityId}, '')`,
        table.name,
      )
      .where(sql`${table.kind} = 'milestone'`),
    check(
      "product_event_kind_known",
      sql`${table.kind} IN ('milestone', 'activity')`,
    ),
  ],
);
