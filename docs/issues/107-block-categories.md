# 107 — Categories are a name on a block, not a table

**Status:** accepted · **Date:** 2026-08-28 · **Area:** `packages/domain`, `packages/db` (migration `0031`), `packages/validators`, `packages/api`, `apps/nextjs`. One nullable column. **Refines:** [105](105-a-block-library-and-a-drop-target-timeline.md), [106](106-the-timeline-is-a-run-of-weeks.md).

## Context

The block library is a flat list. That is fine at six blocks and unusable at
sixty, which is where a gym that has been running matops for a year lands: every
theme it has ever taught, in one column beside the timeline.

The owner asked for **categories an instructor can create, with the groups
collapsible, and the category set while writing the block.**

## 1. A column, not a table

Two shapes were weighed.

- **(A) A `curriculum_category` table** with a name, an order and a foreign key
  from the block. Categories can be renamed in one place, ordered by hand, and
  can exist while empty.
- **(B) A nullable `category text` on the block.** Creating a category is typing
  a name that no block has yet.

**Take (B).** A category here has no attributes of its own: no colour, no
description, no deliberate order, and nothing points at it but the block. A
table would add a migration, four procedures and a decision about what happens
to blocks when a category is deleted, all to hold a string. It also matches what
was asked for exactly: "during creation block instructor set category or create
new one" **is** typing a name in the block form.

The cost is that renaming a category means editing each block in it, and that a
category with no blocks does not exist. If either becomes a real complaint, or
categories grow an order or a colour, (A) is the upgrade and the column becomes
its foreign key.

## 2. Two spellings of one category is the failure mode

The obvious hole in (B) is that "Guard" and "guard" become two groups, and with
free text a gym gets there within a week.

`canonicalCategory(input, existing)` in `packages/domain` closes it: a name that
matches an existing one **case-insensitively** is stored with the **existing**
spelling, so the second block typed as "guard" files under "Guard". Only a
genuinely new name is stored as typed. The server runs it on every create and
update against the academy's own list, and an update excludes the block being
saved so renaming the last block in a category can actually rename it.

The form offers what exists as a **dropdown**: the academy's categories, "No
category", and a final **New category…** which reveals a text box. So picking is
the default act and creating is a deliberate one.

A native `<datalist>` was tried first and removed. It cannot be styled, so on
the app's dark form it drew a pale system popup that belonged to no theme, and
it **filters as you type** rather than offering the list, which is the opposite
of what a picker is for: having typed three letters you can no longer see what
else exists. The dropdown is the app's own `Select`, already used by the
template form.

## 3. Grouping is a pure rule

`groupByCategory` returns the groups in name order with the uncategorised group
last, and sorts the blocks inside each. It is pure and tested, beside
`rippleFrom`, because "where does an uncategorised block go" is a rule and not a
render detail.

The rail draws each group as a `Collapsible` (the component ADR 102 added) with
the block count and a chevron that rotates on `rotate` alone. **Groups start
closed.** The whole reason categories exist is that sixty blocks in one column
is unreadable, and opening every group by default gives back exactly that
column with headings in it. Closed, the rail is a short list of category names
with counts, which is the thing worth scanning. What is opened is remembered for
the session, not saved: opening a category is a two-minute act, and persisting
it would need a store this screen does not otherwise have.

**A library with no categories draws no headers at all.** One group, unnamed, is
a flat list, which is what a gym with six blocks should keep seeing.

## Consequences

- Migration `0031` adds `category text` to `curriculum_block_template`, nullable,
  no index: the library is read whole and is one page long. **Applied to Neon**
  (2026-08-28, 32 rows in `drizzle.__drizzle_migrations`).
- `curriculum.board` gains `categories`, the academy's distinct names in order,
  which the form's `<datalist>` reads.
- No new procedure. `createBlock` and `updateBlock` take an optional `category`;
  an empty string means none.
- **Not verified in a browser.** Typecheck, lint and `next build` are green, the
  pure rules were exercised with `node --experimental-strip-types`, and the
  migration was replayed on a throwaway PGlite before being applied. Still to
  walk: a collapsed group under a finger, and whether the datalist offers itself
  usefully on a phone keyboard.
