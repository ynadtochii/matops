# One-off data scripts

Migrations are **structure only**: tables, columns, indexes, constraints, RLS
policies, grants. Nothing that writes or rewrites a row belongs in one.

Filling a new column, correcting rows, or any other data change lives here as a
plain `.sql` file, run by hand against the database that needs it:

```
psql "$POSTGRES_URL&sslrootcert=system" -f packages/db/scripts/<name>.sql
```

Why they are kept apart:

- A migration runs everywhere, automatically, forever. A data fill is usually
  right once, on one database, and re-running it later can undo a correction
  somebody made by hand since.
- `drizzle-kit generate` writes the structural half for you. Anything you had
  to hand-write into a generated file is a sign it was not structure.
- A migration that fails halfway leaves the schema in a state the next deploy
  has to reason about. A script that fails is just a script you run again.

Every script here should say at the top what it is for, which rows it touches,
whether it is safe to run twice, and whether it has already been run.
