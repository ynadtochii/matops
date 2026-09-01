import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const LOCK = 4021979;
const client = new pg.Client({
  connectionString: url.replace("-pooler", ""),
});

await client.connect();
try {
  await client.query("select pg_advisory_lock($1)", [LOCK]);

  console.log(`[migrate:deploy] journal has ${expected} entries, applying`);
  execFileSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
    cwd: pkgRoot,
    stdio: "inherit",
    env: { ...process.env, ALLOW_PROD_WRITE: "1" },
  });

  const { rows } = await client.query(
    "select count(*)::int as n from drizzle.__drizzle_migrations",
  );
  const applied = rows[0].n;

  if (applied !== expected) {
    throw new Error(
      `[migrate:deploy] ${applied} rows in drizzle.__drizzle_migrations, journal has ${expected}.\n` +
        `  drizzle-kit skips any entry whose "when" is not newer than the last\n` +
        `  applied row and still reports success. Fix the "when" stamps in\n` +
        `  packages/db/migrations/meta/_journal.json and redeploy.`,
    );
  }

  console.log(`[migrate:deploy] ok: ${applied} migrations applied`);
} finally {
  await client.query("select pg_advisory_unlock($1)", [LOCK]).catch(() => null);
  await client.end();
}
