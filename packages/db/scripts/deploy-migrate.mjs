import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(here, "..");

if (
  process.env.VERCEL_ENV !== "production" &&
  process.env.FORCE_DEPLOY_MIGRATE !== "1"
) {
  console.log(
    `[migrate:deploy] skipped, VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}`,
  );
  process.exit(0);
}

const url = process.env.POSTGRES_URL;
if (!url) throw new Error("[migrate:deploy] POSTGRES_URL is not set");

const journal = JSON.parse(
  readFileSync(
    path.join(pkgRoot, "migrations", "meta", "_journal.json"),
    "utf8",
  ),
);
const expected = journal.entries.length;
const legacyDrop = journal.entries.find(
  (entry) => entry.tag === "0072_shared_memberships_only",
);
const expansionHead = journal.entries.find(
  (entry) => entry.tag === "0071_solid_nightcrawler",
);
const contractMigration = journal.entries.find(
  (entry) => entry.tag === "0074_remove_legacy_dues",
);
const applicationHead = journal.entries.find(
  (entry) => entry.tag === "0073_mature_thena",
);

const LOCK = 4021979;
const client = new pg.Client({
  connectionString: url.replace("-pooler", ""),
});

async function appliedThrough() {
  const { rows } = await client.query(
    "select to_regclass('drizzle.__drizzle_migrations') is not null as present",
  );
  if (!rows[0]?.present) return 0;
  const latest = await client.query(
    "select coalesce(max(created_at), 0)::bigint as value from drizzle.__drizzle_migrations",
  );
  return Number(latest.rows[0]?.value ?? 0);
}

async function countLegacyRows() {
  let total = 0;
  for (const table of [
    "membership_plan",
    "member_dues",
    "payment_claim",
    "payment_settings",
  ]) {
    const exists = await client.query(
      "select to_regclass($1) is not null as present",
      [`public.${table}`],
    );
    if (!exists.rows[0]?.present) continue;
    const result = await client.query(
      `select count(*)::int as value from "${table}"`,
    );
    total += Number(result.rows[0]?.value ?? 0);
  }
  return total;
}

async function migrateThrough(entry) {
  const stage = mkdtempSync(path.join(tmpdir(), "matops-migrations-"));
  try {
    const meta = path.join(stage, "meta");
    mkdirSync(meta);
    const entries = journal.entries.filter((item) => item.idx <= entry.idx);
    writeFileSync(
      path.join(meta, "_journal.json"),
      `${JSON.stringify({ ...journal, entries }, null, 2)}\n`,
    );
    for (const item of entries) {
      cpSync(
        path.join(pkgRoot, "migrations", `${item.tag}.sql`),
        path.join(stage, `${item.tag}.sql`),
      );
    }
    const pool = new pg.Pool({
      connectionString: url.replace("-pooler", ""),
      max: 1,
    });
    try {
      await migrate(drizzle(pool), { migrationsFolder: stage });
    } finally {
      await pool.end();
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

await client.connect();
try {
  await client.query("select pg_advisory_lock($1)", [LOCK]);

  const legacyRows = await countLegacyRows();
  const applied = await appliedThrough();
  if (
    legacyRows > 0 &&
    legacyDrop &&
    expansionHead &&
    applied < legacyDrop.when
  ) {
    if (applied < expansionHead.when) {
      await migrateThrough(expansionHead);
    }
    throw new Error(
      `[migrate:deploy] ${legacyRows} legacy dues rows need conversion.\n` +
        "  Run the person and legacy dues dry-run scripts, review their output,\n" +
        "  rerun each with -v apply=true, then deploy again.",
    );
  }

  const deferContract =
    contractMigration &&
    applicationHead &&
    applied < contractMigration.when &&
    process.env.ALLOW_LEGACY_DUES_DROP !== "1";

  if (deferContract) {
    if (applied < applicationHead.when) {
      await migrateThrough(applicationHead);
    }
    console.log(
      "[migrate:deploy] application migrations applied. Redeploy with ALLOW_LEGACY_DUES_DROP=1 after this version is live to remove legacy dues tables.",
    );
  } else {
    console.log(`[migrate:deploy] journal has ${expected} entries, applying`);
    execFileSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
      cwd: pkgRoot,
      stdio: "inherit",
      env: { ...process.env, ALLOW_PROD_WRITE: "1" },
    });

    const { rows } = await client.query(
      "select count(*)::int as n from drizzle.__drizzle_migrations",
    );
    const appliedCount = rows[0].n;

    if (appliedCount !== expected) {
      throw new Error(
        `[migrate:deploy] ${appliedCount} rows in drizzle.__drizzle_migrations, journal has ${expected}.\n` +
          `  drizzle-kit skips any entry whose "when" is not newer than the last\n` +
          `  applied row and still reports success. Fix the "when" stamps in\n` +
          `  packages/db/migrations/meta/_journal.json and redeploy.`,
      );
    }

    console.log(`[migrate:deploy] ok: ${appliedCount} migrations applied`);
  }
} finally {
  await client.query("select pg_advisory_unlock($1)", [LOCK]).catch(() => null);
  await client.end();
}
