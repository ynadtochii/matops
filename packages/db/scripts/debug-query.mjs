import process from "node:process";
import pg from "pg";

const DEBUG_ROLE = "matops_debug_ro";
const DEBUG_LOGIN = "matops_debug_agent";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_CELL_CHARACTERS = 2_000;

function usage() {
  return [
    'usage: pnpm db:debug -- [--organization <id>] [--entity <id>] [--limit <1-500>] [--explain] "<query>"',
    "       pnpm db:debug -- [scope options] -",
  ].join("\n");
}

function takeValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} needs a value.\n${usage()}`);
  }
  return value;
}

function parseArgs(argv) {
  const result = {
    organizationId: undefined,
    entityId: undefined,
    limit: DEFAULT_LIMIT,
    explain: false,
    query: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--organization") {
      result.organizationId = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === "--entity") {
      result.entityId = takeValue(argv, index, arg);
      index += 1;
    } else if (arg === "--limit") {
      const value = takeValue(argv, index, arg);
      const limit = Number(value);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        throw new Error(`--limit must be between 1 and ${MAX_LIMIT}.`);
      }
      result.limit = limit;
      index += 1;
    } else if (arg === "--explain") {
      result.explain = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (result.query === undefined) {
      result.query = arg;
    } else {
      throw new Error(`Only one query is allowed.\n${usage()}`);
    }
  }

  if (result.query === undefined) throw new Error(usage());
  return result;
}

async function readStdin() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

function normalizeQuery(input) {
  const query = input.trim().replace(/;+\s*$/, "");
  if (!query) throw new Error("The query is empty.");
  if (query.includes(";")) {
    throw new Error("Only one SQL statement is allowed.");
  }
  if (!/^(select|with|values|table)\b/i.test(query)) {
    throw new Error("Only SELECT, WITH, VALUES, or TABLE queries are allowed.");
  }
  return query;
}

function boundedValue(value) {
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value)) return `[binary value: ${value.length} bytes]`;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    return value.length > MAX_CELL_CHARACTERS
      ? `${value.slice(0, MAX_CELL_CHARACTERS)}...[truncated]`
      : value;
  }
  if (typeof value !== "object") return value;

  const serialized = JSON.stringify(value);
  return serialized.length > MAX_CELL_CHARACTERS
    ? `${serialized.slice(0, MAX_CELL_CHARACTERS)}...[truncated]`
    : value;
}

function boundedRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, boundedValue(value)]),
  );
}

function readDatabaseUrl() {
  const value = process.env.MATOPS_PROD_READONLY_URL;
  if (!value) {
    throw new Error(
      "MATOPS_PROD_READONLY_URL is not set. Store the matops_debug_agent Neon URL in the macOS Keychain.",
    );
  }

  const url = new URL(value);
  if (!url.hostname.endsWith(".neon.tech")) {
    throw new Error(`Refusing non-Neon host: ${url.hostname}`);
  }
  const sslMode = url.searchParams.get("sslmode");
  if (!sslMode || !["require", "verify-ca", "verify-full"].includes(sslMode)) {
    throw new Error("The debug URL must require TLS through sslmode.");
  }
  return { value, host: url.hostname };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.query === "-" ? await readStdin() : args.query;
  const query = normalizeQuery(input);
  const database = readDatabaseUrl();
  const client = new pg.Client({
    connectionString: database.value,
    application_name: "matops-db-debug",
  });

  await client.connect();
  let transactionOpen = false;
  try {
    const identity = await client.query({
      text: "select current_user as current_user, pg_has_role(current_user, $1, 'member') as has_role",
      values: [DEBUG_ROLE],
      queryMode: "extended",
    });
    const currentUser = identity.rows[0]?.current_user;
    if (currentUser !== DEBUG_LOGIN) {
      throw new Error(
        `Refusing database login ${JSON.stringify(currentUser)}. Expected ${DEBUG_LOGIN}.`,
      );
    }
    if (!identity.rows[0]?.has_role) {
      throw new Error(`${DEBUG_LOGIN} is not a member of ${DEBUG_ROLE}.`);
    }

    await client.query("begin transaction read only");
    transactionOpen = true;
    await client.query(`set local role ${DEBUG_ROLE}`);
    await client.query("set local statement_timeout = '10s'");
    await client.query("set local lock_timeout = '2s'");
    await client.query("set local idle_in_transaction_session_timeout = '15s'");
    await client.query("set local search_path = public, pg_catalog");

    if (args.organizationId) {
      await client.query({
        text: "select set_config('app.organization_id', $1, true)",
        values: [args.organizationId],
        queryMode: "extended",
      });
    }
    if (args.entityId) {
      await client.query({
        text: "select set_config('app.academy_id', $1, true)",
        values: [args.entityId],
        queryMode: "extended",
      });
    }

    const limitedQuery = `select * from (${query}) as matops_debug_result limit $1`;
    const text = args.explain
      ? `explain (format json) ${limitedQuery}`
      : limitedQuery;
    const result = await client.query({
      text,
      values: [args.limit + 1],
      queryMode: "extended",
    });
    const truncated = !args.explain && result.rows.length > args.limit;
    const returnedRows = truncated
      ? result.rows.slice(0, args.limit)
      : result.rows;
    const rows = returnedRows.map(boundedRow);

    await client.query("commit");
    transactionOpen = false;
    console.log(
      JSON.stringify(
        {
          target: "production",
          host: database.host,
          organizationId: args.organizationId ?? null,
          entityId: args.entityId ?? null,
          rowCount: rows.length,
          truncated,
          columns: result.fields.map((field) => field.name),
          rows,
        },
        null,
        2,
      ),
    );
  } finally {
    if (transactionOpen) await client.query("rollback").catch(() => undefined);
    await client.end();
  }
}

main().catch((error) => {
  console.error(
    `[db:debug] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
