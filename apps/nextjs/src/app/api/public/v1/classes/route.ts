import { handleClasses, handleOptions } from "@matops/api/public";
import { db } from "@matops/db/client";

/**
 * `GET /api/public/v1/classes?from=&to=` — the classes the owner shared, in the
 * academy's zone. Cancelled, deleted, past and unpublished classes are absent,
 * and no response carries capacity or a count.
 */
export function GET(req: Request) {
  return handleClasses(req, db);
}

export function OPTIONS(req: Request) {
  return handleOptions(req);
}
