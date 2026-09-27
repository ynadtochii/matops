import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const journal = JSON.parse(
  readFileSync(
    path.join(here, "..", "migrations", "meta", "_journal.json"),
    "utf8",
  ),
);

const url = process.env.POSTGRES_URL;
if (!url) throw new Error("POSTGRES_URL is not set");

const direct = url.replace("-pooler", "");
const client = new pg.Client({ connectionString: direct });
await client.connect();

let failed = 0;
const ALL_GRANTS = { sel: true, ins: true, upd: true, del: true };
const APPEND_ONLY = {
  academy_waiver: { sel: true, ins: true, upd: false, del: false },
  waiver_acceptance: { sel: true, ins: true, upd: false, del: true },
};

const check = (ok, label, detail = "") => {
  if (!ok) failed += 1;
  console.log(
    `${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`,
  );
};

try {
  console.log(`host: ${new URL(direct).hostname}\n`);

  const { rows: applied } = await client.query(
    "select count(*)::int as n from drizzle.__drizzle_migrations",
  );
  check(
    applied[0].n === journal.entries.length,
    "migrations applied",
    `${applied[0].n} of ${journal.entries.length}`,
  );

  const { rows: role } = await client.query(
    "select count(*)::int as n from pg_roles where rolname = 'matops_app'",
  );
  check(role[0].n === 1, "matops_app role exists");

  if (role[0].n === 1) {
    const { rows: member } = await client.query(
      "select pg_has_role(current_user, 'matops_app', 'member') as ok",
    );
    check(member[0].ok, "connection role can SET ROLE matops_app");
  }

  const { rows: tables } = await client.query(`
    select c.relname as name,
           c.relrowsecurity as rls,
           (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies,
           has_table_privilege('matops_app', c.oid, 'SELECT') as sel,
           has_table_privilege('matops_app', c.oid, 'INSERT') as ins,
           has_table_privilege('matops_app', c.oid, 'UPDATE') as upd,
           has_table_privilege('matops_app', c.oid, 'DELETE') as del
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'academy_id' and not a.attisdropped
      )
    order by 1
  `);

  check(tables.length > 0, "tables with academy_id found", `${tables.length}`);

  const reachable = tables.filter((t) => t.sel || t.ins || t.upd || t.del);
  const baseOnly = tables.filter((t) => !t.sel && !t.ins && !t.upd && !t.del);

  const bad = reachable.filter((t) => {
    const want = APPEND_ONLY[t.name] ?? ALL_GRANTS;
    return (
      !t.rls ||
      t.policies === 0 ||
      t.sel !== want.sel ||
      t.ins !== want.ins ||
      t.upd !== want.upd ||
      t.del !== want.del
    );
  });
  check(
    bad.length === 0,
    "every table matops_app can reach has RLS, a policy and its grants",
    `${reachable.length} checked`,
  );
  for (const t of bad) {
    console.log(
      `      ${t.name}: rls=${t.rls} policies=${t.policies} ` +
        `select=${t.sel} insert=${t.ins} update=${t.upd} delete=${t.del}`,
    );
  }

  if (baseOnly.length > 0) {
    console.log(
      `      base-connection only, no matops_app grants (ADR 60): ` +
        baseOnly.map((t) => t.name).join(", "),
    );
  }

  const { rows: counts } = await client.query(`
    select (select count(*) from "user")::int as users,
           (select count(*) from "organization")::int as academies
  `);
  console.log(
    `\ncontents: ${counts[0].users} users, ${counts[0].academies} academies`,
  );
} finally {
  await client.end();
}

process.exit(failed === 0 ? 0 : 1);
