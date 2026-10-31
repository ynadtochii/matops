import { z } from "zod/v4";

import { FILE_KINDS, FILE_TYPES, MAX_UPLOAD_BYTES } from "@matops/domain";

export const CreateUploadSchema = z.object({
  kind: z.enum(FILE_KINDS),
  contentType: z.enum(FILE_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export const CompleteUploadSchema = z.object({
  fileId: z.uuid(),
});
