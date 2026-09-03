# MatOps production debug database setup

Use this only when the production SQL helper reports a missing role or credential.

## Database roles

Migration `0048_debug_readonly.sql` creates `matops_debug_ro`. Deploy that migration before creating the login.

Create one dedicated login in the production Neon branch. Generate its password outside the repository and replace the placeholder only in the Neon SQL editor:

```sql
CREATE ROLE matops_debug_agent LOGIN PASSWORD '<generated-password>';
GRANT matops_debug_ro TO matops_debug_agent;
```

Do not grant this login membership in `matops_app`, the Neon owner role, or any write role.

Build a Neon connection string for `matops_debug_agent`. It must include `sslmode=require` or `sslmode=verify-full`.

## macOS Keychain

Store the full connection string without placing it in shell history:

```sh
security add-generic-password -U -a "$USER" -s matops-prod-debug-db -w
```

The command prompts for the value. Paste the connection string at that prompt.

Do not store this string in `.env`, `.env.local`, repository files, task instructions, or chat messages.

## Check the setup

From the MatOps repository root:

```sh
sh .claude/skills/debug/scripts/sql.sh "select current_database() as database_name, current_user as database_user"
```

The result must report `matops_debug_agent`. A query of an entity-scoped table without `--entity` must return no rows because row-level security fails closed.
