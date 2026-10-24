import { publicFileResponse } from "@matops/api/public-file";
import { storage } from "@matops/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  return publicFileResponse(key.join("/"), storage());
}
