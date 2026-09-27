# 144 · Academy-defined class disciplines

**Status:** accepted · **Date:** 2026-09-27 · **Area:** schedule, Settings, database

## Decision

An academy owns its list of class disciplines. The list starts empty. Owners and managers can add, rename and delete names in Settings. Staff can choose a listed discipline or None when they create a recurring template or a one-off class. A discipline is optional and is not a rank system.

`class_template.discipline` and `class.discipline` are nullable text, not a database enum or a foreign key to the list. The list is scoped to the academy by row-level security. Schedule writes check that a non-null name belongs to the active academy. The database enforces unique names within each academy without regard to case.

The schema change clears the old fixed values from existing templates. Existing class instances retain their saved strings. Renaming a list entry changes matching templates and future scheduled classes; deleting it clears their matching discipline. Past classes keep their saved value, including on attendance records. No academy receives seeded choices.

The rank systems for BJJ and Judo remain separate. Their belts and promotion history do not change when a class discipline is renamed or deleted.

## Deployment

The migration keeps both schedule columns present and nullable while the old application serves during a build. Changing an enum column to text lets the old application continue to send its fixed strings until the new application takes over. Production migration runs through deployment, not from a laptop.

## 2026-09-27 · Management moved to the template form

The first version put add, rename and delete in Settings. They now sit beside the discipline picker in the recurring template form, where the owner or manager needs them. Settings no longer has a second discipline editor. Instructors still select existing names without managing them. Both rename and delete ask for confirmation and name their effect on matching templates and future classes, including one-offs. Adding a name selects it in the open template form.

## 2026-09-27 · One picker, not a second form

The separate Add and Manage buttons below the native select added a second control area. The recurring-template form now uses one custom dropdown: None, each academy name with a three-dot edit action, and Add discipline as the last row. Add opens one name-and-save row; edit opens rename and delete in the same dropdown. Both destructive changes warn before updating matching templates and future classes. Instructors see the choices without the management actions.

## 2026-09-27 · Colors follow the list, not fixed names

The schedule colors still read the old fixed values: `bjj` and `judo` were teal, `nogi` and `mma` were amber, and every academy-defined name fell to the neutral block. That left new names like "Gi" or "Open mat" uncolored. Colors now come from the academy's list. The first five names, in list order (by name), get five muted hues, `--discipline-1` to `--discipline-5`. Any other name, a name not in the list, or no discipline, keeps the neutral dashed block. The pure rule is `disciplineHue` in `@matops/domain`, and the week grid, day rail, dots, mobile schedule and poster all index their palette with it. The grid legend lists the colored names. `discipline.list` is now readable by any enrolled member, the same level as `class.mine`, so the student web and the Expo app can color their schedules. It returns only names. This replaces ADR 53's `--gi` and `--nogi` tokens.
