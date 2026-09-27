# Goal
Allow each academy to manage its own optional class disciplines without seeded choices.

## Decisions
- Class and template disciplines remain nullable strings, not foreign keys.
- Existing templates lose their old fixed discipline during the structural migration. Existing class instances keep their saved value.
- Renaming an academy discipline updates matching templates and future scheduled classes. Deleting one clears it on those rows. Past classes retain their saved value.
- Owners and managers manage disciplines beside the template picker; instructors can only select them. The one-off class picker reads the same list.
- Existing seeded rank systems stay separate.

## Implementation Steps
1. Replace the discipline enum with nullable text, add an academy-scoped discipline list, and protect it with row-level security.
2. Add list, create, rename, and delete API actions. Validate selections against the active academy's list.
3. Keep both class pickers backed by the academy list. In the recurring-template form, replace the native select and separate editor with one custom picker: None, names with a three-dot edit action, and Add at the bottom.
4. Add and edit within that picker. Confirm rename and delete with warnings about matching templates and future classes. Update docs and verify the rendered picker, lint, typecheck and formatting.

## Current Step
The single-list picker is complete. A temporary browser preview exercised open, Add, three-dot edit, delete warning and Escape focus return; it was removed afterward. Lint, typecheck and format pass. Production migration `0005` remains pending.

## Risk
The migration runs before new code is promoted. Keep the old class and template columns available throughout deployment.
