/**
 * @matops/domain — pure business logic, framework-free (no I/O, no db, no tRPC).
 *
 * This is where the rules that must be tested in isolation live: the booking
 * policy, the approval/role rules, capacity display, schedule materialization
 * math. Keep every export a pure function so it is trivially unit-testable
 * (see delivery.md §5 — domain + tests come before the API layer).
 *
 * Slices fill this in:
 *   - 3.1 book/cancel transition + soft-capacity display
 *   - 1.4 approval → role grant rules
 *   - 2.2 template → concrete-class materialization math
 */

export * from "./academy-code";
export * from "./academy-settings";
export * from "./access";
export * from "./access-plan";
export * from "./attendance";
export * from "./booking";
export * from "./calendar";
export * from "./checkin";
export * from "./class-edit";
export * from "./coach";
export * from "./csv";
export * from "./dashboard";
export * from "./desk";
export * from "./dropin";
export * from "./entity";
export * from "./format";
export * from "./freshness";
export * from "./grid";
export * from "./gym-creator";
export * from "./leads";
export * from "./local-date";
export * from "./materialize";
export * from "./organization-setup";
export * from "./membership-access";
export * from "./membership-month";
export * from "./membership";
export * from "./notify";
export * from "./payments";
export * from "./plan-price";
export * from "./phone";
export * from "./query-window";
export * from "./rank";
export * from "./schedule";
export * from "./signup";
export * from "./slug";
export * from "./stats";
