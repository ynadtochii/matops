/**
 * Seed registry — the single source of "what is a seed row".
 *
 * The whole seed module hangs off two facts about the schema:
 *  1. Every tenant table carries a `text academy_id` (that is how RLS works), so
 *     the academy id is the natural teardown key: "delete every row whose
 *     `academy_id` is a seed academy".
 *  2. Auth rows we create (`user`/`session`/`account`) carry a `seed_` id prefix,
 *     so teardown finds them by that prefix. The prefix IS the marker — no ledger
 *     table, no extra bookkeeping.
 *
 * There is deliberately NO heavy production guard here (there are no production
 * academies). `assertSeedableTarget` keeps one cheap check so a stray run against
 * a `NODE_ENV=production` database still refuses unless explicitly allowed.
 */

// Type-only import — erased at runtime, so this file (and teardown) stay free of
// the `./client` connection side effect and remain unit-testable without a DB.
import { createHash } from "node:crypto";

import type { db } from "../client";
import { assertDevDatabase } from "../env-guard";

/** A base drizzle handle (node-postgres in prod; a cast PGlite handle in tests). */
export type SeedExec = typeof db;

/** Id prefix stamped on every auth row (`user`/`session`/`account`) the seed creates. */
export const SEED_MARKER = "seed_";

/** One demo academy the seed populates. `id` is a `text` org id (not a uuid). */
export interface SeedAcademy {
  /** Short key used to build deterministic child ids (e.g. "alma"). */
  key: string;
  /** Better Auth organization id (text PK) — the teardown key for every tenant row. */
  id: string;
  name: string;
  slug: string;
  /** 6-digit `organization.public_code`; a reserved 99xxxx band keeps demos obvious. */
  publicCode: string;
  timeZone: string;
  currency: string;
  country?: string;
  address?: string;
  mapUrl?: string;
}

/**
 * The single demo academy the beta test runs on. YOU own it; the tester joins
 * through the seeded instructor invite link.
 */
export const SEED_ACADEMY: SeedAcademy = {
  key: "alma",
  id: "seed_org_alma",
  name: "Alma beta",
  slug: "seed-alma-beta",
  publicCode: "990001",
  timeZone: "Europe/Kyiv",
  currency: "EUR",
  country: "UA",
  address: "vul. Velyka Vasylkivska 100, Kyiv",
  mapUrl: "https://maps.google.com/?q=50.4262,30.5196",
};

/**
 * The general-branches pilot (ADR 126). Listed here so `seed down` removes it
 * with everything else: teardown resolves each org's entities itself, so the
 * gym and the sauna go with it without being named again.
 */
export const PILOT_ACADEMY: SeedAcademy = {
  key: "pilot",
  id: "seed_org_pilot",
  name: "Pilot Gym",
  slug: "seed-pilot-gym",
  publicCode: "990002",
  timeZone: "Europe/Lisbon",
  currency: "EUR",
};

/** Every seed academy as a list, for the generic teardown. */
export const seedAcademyList: readonly SeedAcademy[] = [
  SEED_ACADEMY,
  PILOT_ACADEMY,
];

/** The org ids that scope every seed tenant row — the teardown `IN (...)` set. */
export const seedAcademyIds: readonly string[] = seedAcademyList.map(
  (a) => a.id,
);

/** A seed `user.id` for a fake persona handle (e.g. "coach1" → "seed_user_coach1"). */
export const seedUserId = (handle: string): string =>
  `${SEED_MARKER}user_${handle}`;

/** A seed `member.id` scoped to one academy + persona (deterministic → idempotent). */
export const seedMemberId = (academyKey: string, handle: string): string =>
  `${SEED_MARKER}mem_${academyKey}_${handle}`;

/** The seed `entity_membership.id` mirroring one `member.id` (ADR 124). */
export const seedEntityMembershipId = (memberId: string): string =>
  memberId.replace(`${SEED_MARKER}mem_`, `${SEED_MARKER}emem_`);

export function seedPersonId(memberId: string): string {
  const hex = createHash("sha256").update(memberId).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

/** The seed `entity_membership.id` for one academy + persona. Dues, claims,
 * ranks, notes and referrals key on this, not on `member.id` (ADR 124). */
export const seedMembershipId = (academyKey: string, handle: string): string =>
  seedEntityMembershipId(seedMemberId(academyKey, handle));

/** True if an id was created by the seed (used by teardown to spare real rows). */
export const isSeedId = (id: string): boolean => id.startsWith(SEED_MARKER);

/**
 * Refuse to run against a production database unless explicitly allowed. This is
 * the ONLY guard (the user asked not to over-separate) — there are no production
 * academies, so a marker-scoped teardown is already safe; this just stops an
 * accidental prod run. Override with `SEED_ALLOW=1`.
 */
export function assertSeedableTarget(env = process.env): void {
  assertDevDatabase("seed", env);

  if (env.NODE_ENV === "production" && env.SEED_ALLOW !== "1") {
    throw new Error(
      "Refusing to seed a production database. Set SEED_ALLOW=1 to override.",
    );
  }
}

/**
 * The email of the real user YOU sign in as. The seed attaches the demo data to
 * this existing user (owner of the demo academy) — it never creates them, so
 * teardown never touches your real account. Resolved from the CLI arg or
 * `SEED_EMAIL`.
 */
export function resolveOwnerEmail(
  argEmail: string | undefined,
  env = process.env,
): string {
  const email = (argEmail ?? env.SEED_EMAIL ?? "").trim().toLowerCase();
  if (!email) {
    throw new Error(
      "No email given. Pass your sign-in email so the seed can attach the demo " +
        "data to your real account:\n" +
        "  pnpm -F @matops/db seed up you@example.com\n" +
        "  (or set SEED_EMAIL=you@example.com)",
    );
  }
  return email;
}
