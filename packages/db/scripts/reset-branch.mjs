import pg from "pg";

const [, , expectedHost] = process.argv;

if (!expectedHost) {
  console.error(
    "usage: I_UNDERSTAND_THIS_DROPS_EVERYTHING=1 node scripts/reset-branch.mjs <expected-host-fragment>\n" +
      "  Drops schemas `public` and `drizzle` from POSTGRES_URL, leaving an empty database.\n" +
      "  The host fragment must appear in the connection host, so naming the wrong\n" +
      "  target fails instead of running.",
  );
  process.exit(1);
}

if (process.env.I_UNDERSTAND_THIS_DROPS_EVERYTHING !== "1") {
  console.error(
    "Refusing: set I_UNDERSTAND_THIS_DROPS_EVERYTHING=1 to run this.",
  );
  process.exit(1);
}

const url = process.env.POSTGRES_URL;
if (!url) throw new Error("POSTGRES_URL is not set");

const direct = url.replace("-pooler", "");
const host = new URL(direct).hostname;

if (!host.includes(expectedHost)) {
  console.error(
    `Refusing: POSTGRES_URL host is ${host}, which does not contain "${expectedHost}".`,
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: direct });
await client.connect();

try {
  const { rows: before } = await client.query(`
    select n.nspname as schema, count(*)::int as tables
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname in ('public', 'drizzle')
    group by 1 order by 1
  `);

  console.log(`host: ${host}`);
  console.log(`about to drop:`);
  for (const r of before)
    console.log(`  schema ${r.schema}: ${r.tables} tables`);
  if (before.length === 0) console.log("  nothing (already empty)");

  await client.query("drop schema if exists drizzle cascade");
  await client.query("drop schema if exists public cascade");
  await client.query("create schema public");

  const { rows: after } = await client.query(`
    select count(*)::int as tables
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname in ('public', 'drizzle')
  `);

  console.log(`done, ${after[0].tables} tables remain`);
  console.log(
    "The matops_app role survives a schema drop; migration 0001 is idempotent about it.",
  );
  console.log("Next: deploy, and vercel-build applies all migrations.");
} finally {
  await client.end();
}
