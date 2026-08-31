import { handleAcademy, handleOptions } from "@matops/api/public";
import { db } from "@matops/db/client";

/**
 * Public booking API (ADR 115), `GET /api/public/v1/academy`. The gym's own
 * header: name, zone, address and map link. The `X-Matops-Key` header names the
 * academy, so no id appears in the path.
 */
export function GET(req: Request) {
  return handleAcademy(req, db);
}

export function OPTIONS(req: Request) {
  return handleOptions(req);
}
