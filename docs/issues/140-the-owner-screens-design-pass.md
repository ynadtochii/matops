# 140: The owner screens design pass

Date: 2026-09-16

Status: built. Static gates green. Not clicked through in a browser, and no
suite was run here.

## Decision

Every owner facing web screen gets one pass against `docs/design.md`, screen by
screen, inside the existing design system. No token changes, no new palette, no
new radius, no new component library. The plan and the per screen log are
`docs/owner-screens-design-loop-handoff.md`; the route map it works from is
`docs/owner-screens-sitemap.md`.

The pass ran as eleven iterations: branch dashboard, gym overview, memberships,
the people list, the person screen, the roster, schedule, coaches, both settings
screens, reception, and the four small screens.

## What the pass was actually for

The brief said the screens had drifted from the design language. That turned out
to be true, but the drift was not decorative. Four patterns repeated across the
app, and three of them are bugs.

**One `busy` for a whole screen.** Six screens had a single constant that ORed
every mutation on the page and disabled every button. Marking one member paid
deadened the other 199 rows. Pausing one membership deadened Approve on every
branch. Suspending one coach greyed out every other coach's menu. The fix is the
same everywhere and `members.tsx` already had it: key the pending state on the
row being acted on.

**A failed query drawn as nothing to do.** The dashboard claimed "All clear"
when the roster read had failed. The coach requests section returned `null` on
error, so a broken read looked like an empty queue. A branch card said "Not
loaded" while its figures were still loading, drawing a pending state as a
failed one. A queue at zero and a queue that could not be read are different
facts and must look different.

**A button that renames itself.** Twenty-odd controls swapped their label while
a request was in flight: "Save" to "Saving…", "Add" to "Adding…", "Rebuild
schedule" to "Rebuilding…". `Button` has had a `busy` prop the whole time. The
voice rule in design.md §5 says an action keeps its name from button to toast,
and a button that renames itself breaks that before the toast arrives.

**A primitive copied instead of imported.** `Section`'s label classes appeared
verbatim in two Curriculum `h3`s. `Eyebrow`'s classes appeared verbatim in a
Notifications label. Reception invented a third eyebrow size that matched
neither. Five screens used `Eyebrow`, which renders a `<p>`, as a section
heading, so two screens had no `h2` between the page title and the content.

## Consequences

- One behaviour change, specced: ending a membership from the member detail now
  asks first. The identical action on the person screen already did.
- `SECTION_LABEL` is exported from `primitives.tsx`. `Section` uses it, and so
  do the four headings that used to copy it.
- `docs/design.md` §1.5 settled every button weight question in this pass
  without a judgement call, including the two cases where a row action was a
  solid `primary` repeated down a list. The rule is mechanical, and it worked.
- No token, no migration, no procedure and no query changed.

## Not done

- Nothing was opened in a browser. Every screen here is read from the code.
- No suite was run, per the session rule. Run `pnpm test`.
- Section navigation for the settings screens. At four and five sections it
  would be more chrome than the content it indexes.
- Whether `CountBadge` means "N things want you" or a plain total. The docs say
  the first; `people-screen.tsx` uses the second. That is a vocabulary decision
  for its own ADR, so the counts added in this pass stick to attention.
- The memberships dialogs (new plan, price change, coverage) keep their shape.
