import { handleCancel, handleOptions } from "@matops/api/public";
import { db } from "@matops/db/client";

/**
 * `DELETE /api/public/v1/bookings/{cancelToken}` — the class roster stops
 * showing them. The lead survives: someone who cancelled still wanted to train.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  return handleCancel(req, token, db);
}

export function OPTIONS(req: Request) {
  return handleOptions(req);
}
