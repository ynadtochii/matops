import { sql } from "drizzle-orm";
import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

import { entity } from "./entity-schema";

export const curriculumTrack = pgTable(
  "curriculum_track",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    name: t.text().notNull(),
    isDefault: t.boolean().notNull().default(false),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    index("curriculum_track_by_academy").on(table.academyId),
    uniqueIndex("curriculum_track_one_default")
      .on(table.academyId)
      .where(sql`is_default`),
  ],
);

export const curriculumBlockTemplate = pgTable(
  "curriculum_block_template",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    theme: t.text().notNull(),
    notes: t.text(),
    category: t.text(),
    defaultWeeks: t.integer().notNull().default(2),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [index("curriculum_template_by_academy").on(table.academyId)],
);

export const curriculumBlock = pgTable(
  "curriculum_block",
  (t) => ({
    id: t.uuid().notNull().primaryKey().defaultRandom(),
    academyId: t
      .text()
      .notNull()
      .references(() => entity.id),
    trackId: t.uuid().notNull(),
    slotId: t.uuid().notNull(),
    templateId: t.uuid().notNull(),
    notes: t.text(),
    startsOn: t.date({ mode: "string" }).notNull(),
    endsOn: t.date({ mode: "string" }).notNull(),
    weeks: t.integer().notNull(),
    createdAt: t.timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  }),
  (table) => [
    index("curriculum_block_by_academy_start").on(
      table.academyId,
      table.startsOn,
    ),
    index("curriculum_block_by_template").on(table.academyId, table.templateId),
    index("curriculum_block_by_track").on(
      table.academyId,
      table.trackId,
      table.startsOn,
    ),
    index("curriculum_block_by_slot").on(table.academyId, table.slotId),
    uniqueIndex("curriculum_block_one_theme_per_slot").on(
      table.slotId,
      table.templateId,
    ),
  ],
);
