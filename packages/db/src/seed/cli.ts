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
import { removeAll, seedStatus } from "./teardown";

type Command = "down" | "status" | "fill" | "clear" | "pilot";

function parseArgs(argv: string[]): {
  command: Command;
  email?: string;
  code?: string;
} {
  const rest = argv.slice(2);
  const known: Command[] = ["down", "status", "fill", "clear", "pilot"];
  const command = (
    known.includes(rest[0] as Command) ? rest[0] : "pilot"
  ) as Command;
  const email = rest.find((a) => a.includes("@"));
  const code = rest.find((a) => /^\d{6}$/.test(a));
  return { command, email, code };
}

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
    console.log(
      `  academy  ${report.academy.name}  (${report.academy.timeZone})  ${report.academy.id}`,
    );
    return;
  }

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

  const report = await removeAll(exec);
  console.log("[seed] removed:", report);
}

main()
  .then(() => pool.end())
  .catch((err: unknown) => {
    console.error("[seed] failed:", err instanceof Error ? err.message : err);
    void pool.end();
    process.exit(1);
  });
