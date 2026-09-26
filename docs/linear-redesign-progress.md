# Linear redesign: progress ledger

The working record for the `/loop` that runs `docs/linear-redesign-handoff.md`
to the end. Every tick reads this file first and updates it last. The handoff
holds the plan and the rules; ADR 141 holds the decisions and the as-built
notes. This file holds only status.

## How a tick works

1. Read this file. Check `git status`. If a unit is `wip`, finish it before
   starting a new one.
2. Take the first `todo` unit below. Mark it `wip` here before editing code.
3. Do the unit. Follow the handoff's rules and the per-screen checklist:
   no comments on edits, plain language, tokens only, no arbitrary text sizes,
   Lucide icons, the shared `@matops/ui` parts.
4. Run `pnpm typecheck` and `pnpm lint`. Never run tests.
5. Add one `CHANGELOG.md` line, an ADR 141 "As built" line if a technical
   choice was made, and flip the `docs/roadmap.md` cell when a step finishes.
6. Mark the unit `done` with its commit hash. Commit (no AI trailer).
7. If a unit is blocked, mark it `blocked`, write why, and move to the next.

**The loop never merges.** The last unit waits for the user, because merging
`design/linear` into `main` deploys production. When only that unit is left,
stop the loop and notify the user.

## Units

| # | Unit | Status | Commit | Notes |
| --- | --- | --- | --- | --- |
| 0 | Decisions and ADR 141 | done | `147fa2a` | |
| 1 | Tokens, Inter, radius, shadows, dark default | done | `42451fc` | |
| 2 | Shared components, new parts, Lucide | done | `6a7872a` | |
| 3a | Shell: sidebar (level 1, 28px items, branch fold, Gym management) | done | `50471c6` | Box sizes unmeasured: the shell stays hidden behind the loader in this browser |
| 3b | Shell: header, branch picker, mobile shell, overdue strip | done | `159ee7d` | |
| 4.1 | Screens: Members and People (list, person page, leads) | todo | | |
| 4.2 | Screens: Schedule and the curriculum timeline | todo | | |
| 4.3 | Screens: Dashboard and Overview | todo | | |
| 4.4 | Screens: Attendance and Reception | todo | | |
| 4.5 | Screens: Payments and Memberships | todo | | |
| 4.6 | Screens: Coaches, Referrals, Notifications | todo | | |
| 4.7 | Screens: both Settings screens, Profile, class detail | todo | | |
| 4.8 | Screens: student web (schedule, training, dues) | todo | | |
| 4.9 | Screens: public pages (sign-in, start, join, book, check-in, privacy) | todo | | |
| 5 | Mobile (Expo): tokens, fonts, tabs, pushed screens, components | todo | | Static gates only, no simulator |
| 6a | Replace `(app)/design-system`; `/linear-ds` reads the real tokens | todo | | |
| 6b | Lint rule: no hex colors, no arbitrary text sizes in app code | todo | | |
| 6c | Rewrite `docs/design.md`; update roadmap, map, changelog | todo | | |
| 6d | User runs `pnpm test` | waiting on user | | The loop does not run tests |
| 6e | Merge `design/linear` into `main` (production deploy), then update `dev` | waiting on user | | The loop never does this |

## Known limits

- Signed-in screens stall on their loader in this Chrome setup, with or without
  the redesign (stash A/B, 2026-09-26). `resize_window` does not change
  `innerWidth`. Browser checks run on public pages and at the token level; the
  user checks signed-in screens and phone widths.

## Log

- 2026-09-26: steps 0 to 2 done in the session before the loop started.
- 2026-09-26: 3a sidebar done (`50471c6`).
- 2026-09-26: 3b header and mobile shell done (`159ee7d`). Step 3 complete.
