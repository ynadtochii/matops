// Drizzle wraps the driver error, so the Postgres `code` sits a few `cause`
// levels down. Bounded rather than recursive: a cause chain can be a cycle.
const MAX_CAUSE_DEPTH = 4;

function hasCode(error: unknown, code: string): boolean {
  let value: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof value !== "object" || value === null) return false;
    if ("code" in value && value.code === code) return true;
    value = "cause" in value ? value.cause : undefined;
  }
  return false;
}

export function isUniqueViolation(error: unknown): boolean {
  return hasCode(error, "23505");
}
