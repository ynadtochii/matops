import { handleBooking, handleOptions } from "@matops/api/public";
import { db } from "@matops/db/client";

/**
 * `POST /api/public/v1/bookings` — a visitor books a class. It creates or
 * updates a LEAD and one visit row, and never a `user` or a `member`.
 */
export function POST(req: Request) {
  return handleBooking(req, db);
}

export function OPTIONS(req: Request) {
  return handleOptions(req);
}
