/**
 * Seed CLI.
 *
 * Fill YOUR real academy (recommended — the mode you use day to day):
 *   fill <code>   add ~20 fake students + memberships/bookings/attendance/ranks
 *                 to the academy with that 6-digit code. Uses its EXISTING
 *                 plans + classes; your real data is untouched. Refuses if
 *                 already filled. A branch on shared memberships gets
 *                 assignments and paid months; one still on branch dues gets
 *                 dues rows instead.
 *   clear <code>  remove ONLY the fake students + their data from that academy.
 *
 * A separate fake demo academy — "Alma beta", the one the beta test runs on
 * (isolated, deleted by academy id):
 *   up      insert the demo dataset, attached to YOUR real user as its owner.
 *   down    remove the seed academy (never your real user or a real academy).
 *   reset   down, then up.
 *
 *   status [code]  show the demo academy (and, with a code, that academy's fakes).
 *
 * The general-branches pilot (ADR 126) — one organization running a BJJ academy,
 * a gym and a sauna, with the three example plans:
 *   pilot   build it, attached to YOUR real user as its owner. Idempotent.
 *           Removed by `down` like the rest of the seed.
 *
 * The email (arg or SEED_EMAIL) is only needed by up/reset. Sign in once at
 * http://localhost:3004 first so your `user` row exists.
 */
import { eq } from "drizzle-orm";

import { db, pool } from "../client";
import { user } from "../schema";
import {
  academyFakeCount,
  clearAcademy,
  fillAcademy,
  findAcademyByPublicCode,
} from "./augment";
import { seedPilot } from "./pilot";
import { assertSeedableTarget, resolveOwnerEmail } from "./registry";
import { seedAll } from "./run";
import { removeAll, seedStatus } from "./teardown";

type Command = "up" | "down" | "reset" | "status" | "fill" | "clear" | "pilot";

function parseArgs(argv: string[]): {
  command: Command;
  email?: string;
  code?: string;
} {
  const rest = argv.slice(2);
  const known: Command[] = [
    "up",
    "down",
    "reset",
    "status",
    "fill",
    "clear",
    "pilot",
  ];
  const command = (
    known.includes(rest[0] as Command) ? rest[0] : "up"
  ) as Command;
  // The email is the first arg that looks like one (so `seed up you@x.com` works).
  const email = rest.find((a) => a.includes("@"));
  // The code is the first bare 6-digit arg (the academy public code).
  const code = rest.find((a) => /^\d{6}$/.test(a));
  return { command, email, code };
}

/** Resolve the academy a `fill`/`clear` targets, or exit with guidance. */
async function requireAcademy(code: string | undefined) {
  if (!code) {
    throw new Error(
      "Pass the academy's 6-digit code, e.g.  pnpm -F @matops/db seed fill 860275",
    );
  }
  const academy = await findAcademyByPublicCode(db, code);
  if (!academy) throw new Error(`No academy found with code ${code}.`);
  return academy;
}

/** Look up the real user you attach the demo data to. Never created here. */
async function resolveRealUser(email: string) {
  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  return rows[0] ?? null;
}

function printStatus(rows: Awaited<ReturnType<typeof seedStatus>>): void {
  console.log("\nSeed status:");
  for (const r of rows) {
    const mark = r.present ? "✓" : "·";
    console.log(
      `  ${mark} ${r.name}  (${r.academyId})` +
        (r.present
          ? `  — ${r.members} members, ${r.classes} classes, ${r.memberships} memberships`
          : "  — not seeded"),
    );
  }
  console.log("");
}

async function main(): Promise<void> {
  const { command, email, code } = parseArgs(process.argv);
  assertSeedableTarget();
  const exec = db;

  if (command === "pilot") {
    const address = resolveOwnerEmail(email);
    const owner = await resolveRealUser(address);
    if (!owner) {
      throw new Error(
        `No user with email ${address}. Sign in once at http://localhost:3004 first.`,
      );
    }
    const report = await seedPilot(exec, owner.id);
    console.log(`[seed] pilot gym ready for ${address}:`);
    for (const b of report.branches) {
      console.log(`  branch  ${b.name}  (${b.type})  ${b.id}`);
    }
    for (const p of report.plans) {
      console.log(`  plan    ${p.name}  covers ${p.covers.length}`);
    }
    return;
  }

  // --- Fill / clear a REAL academy (the recommended mode) -------------------
  if (command === "fill") {
    const academy = await requireAcademy(code);
    if ((await academyFakeCount(exec, academy.organizationId)) > 0) {
      console.log(
        `[seed] "${academy.name}" already has demo students — run ` +
          `\`seed clear ${code}\` first to rebuild.`,
      );
      return;
    }
    const report = await fillAcademy(exec, {
      academyId: academy.id,
      organizationId: academy.organizationId,
    });
    console.log(`[seed] filled "${academy.name}" (${code}):`, report);
    return;
  }

  if (command === "clear") {
    const academy = await requireAcademy(code);
    const report = await clearAcademy(exec, {
      academyId: academy.id,
      organizationId: academy.organizationId,
    });
    console.log(
      `[seed] cleared demo students from "${academy.name}" (${code}):`,
      report,
    );
    return;
  }

  if (command === "status") {
    if (code) {
      const academy = await findAcademyByPublicCode(exec, code);
      if (!academy) {
        console.log(`No academy found with code ${code}.`);
      } else {
        const fakes = await academyFakeCount(exec, academy.organizationId);
        console.log(
          `\n"${academy.name}" (${code}) — ${fakes} demo student(s) present.\n`,
        );
      }
    }
    printStatus(await seedStatus(exec));
    return;
  }

  if (command === "down") {
    const report = await removeAll(exec);
    console.log("[seed] removed:", report);
    return;
  }

  // up / reset need YOUR real user.
  const realEmail = resolveOwnerEmail(email);
  const realUser = await resolveRealUser(realEmail);
  if (!realUser) {
    throw new Error(
      `No user found for ${realEmail}.\n` +
        `Sign in once at http://localhost:3004 with that email (this creates your\n` +
        `user row), then re-run:  pnpm -F @matops/db seed ${command} ${realEmail}`,
    );
  }

  if (command === "reset") {
    const removed = await removeAll(exec);
    console.log("[seed] removed:", removed);
  } else {
    // up: refuse to double-seed (child tables without a natural unique key would
    // duplicate). Rebuild with `reset` instead.
    const status = await seedStatus(exec);
    if (status.some((s) => s.present)) {
      console.log(
        "[seed] already seeded — run `pnpm -F @matops/db seed reset` to rebuild.",
      );
      printStatus(status);
      return;
    }
  }

  const report = await seedAll(exec, { realUser });
  console.log(`[seed] done for ${realUser.name} <${realEmail}>:`, report);
  printStatus(await seedStatus(exec));
}

main()
  .then(() => pool.end())
  .catch((err: unknown) => {
    console.error("[seed] failed:", err instanceof Error ? err.message : err);
    void pool.end();
    process.exit(1);
  });
