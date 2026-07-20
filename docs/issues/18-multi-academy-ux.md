# 18 — Multi-academy: join + switch UX

Type: grilling
Status: resolved
Blocked by: —

## Question

**Refines [09](09-mvp-product-spec.md) / [05](05-multitenancy-model.md).** "Multi-academy native" is a headline constraint that shaped the schema (membership-in-academy as a first-class join), but the product surface for it is thin — the spec only mentions "a switcher if >1" and never specifies the flows.

Decide the actual UX:
1. **Student joining a 2nd academy** — open another invite link while already signed in → creates a second membership (pending) → how is this surfaced? Does the app auto-switch to the new academy on approval?
2. **Active-academy context** — how does a student/owner switch between academies they belong to? Where does the current-academy live (per-session? persisted? Better Auth "active organization")? Every scoped query keys off it — tie to [12](12-tenant-isolation-mechanism.md) / [15](15-api-deployment-shape.md).
3. **A person who is owner of one gym and student at another** — does the same account span both roles across academies? (The role is per-membership, so yes — confirm the UX doesn't assume one global role.)
4. **v1 minimum** — is full multi-academy UX in v1, or just "the data model supports it, UI assumes one active academy with a basic switcher"? Draw the line.

Output: the join-second-academy flow, the active-academy switch mechanism, and the explicit v1 line.

## Answer

**Data supports many academies per person; v1 UI = one active academy + a basic switcher.**

- **Active academy** = Better Auth `activeOrganizationId` on the session → the tenant middleware reads it to set `app.academy_id` for RLS ([12](12-tenant-isolation-mechanism.md)). All scoped data follows the active academy automatically.
- **Switcher:** a simple dropdown in the nav/profile, **shown only if the person has 2+ memberships in the current client's lens**. Switching calls `setActive(orgId)`; subsequent requests scope to the new academy. No combined cross-academy views in v1.
- **Client is the role lens:** the **web** app lists academies where you're owner/instructor; the **mobile** app lists academies where you're an active student. So an owner-at-A + student-at-B uses web for A and mobile for B on the same login — roles never clash.
- **Join a 2nd academy:** open another invite link while signed in → a new membership is created (student → pending → owner approves; instructor → active). On approval it **appears in the switcher** and the student gets a push ("You're in at {Academy}"). No forced auto-switch — the user chooses when to switch.
- **Default active academy on login:** the persisted `activeOrganizationId`; else the only membership for this client's lens; else (client-lens has none) show a clear empty state (e.g. web with only student memberships → "You don't manage any academies — use the mobile app to train").

**v1 non-goals (deferred):** cross-academy aggregated dashboards, a single schedule spanning gyms, bulk multi-academy management. The data model needs no change to add these later.

**Refines** the product spec ([09](09-mvp-product-spec.md)): the switcher, the join-second flow, and the client-as-role-lens rule.
