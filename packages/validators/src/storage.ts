import { z } from "zod/v4";

import { FILE_KINDS, FILE_RULES, FILE_TYPES } from "@matops/domain";

export const CreateUploadSchema = z.object({
  kind: z.enum(FILE_KINDS),
  contentType: z.enum(FILE_TYPES),
  sizeBytes: z.number().int().positive().max(FILE_RULES.avatar.maxBytes),
});

export const CompleteUploadSchema = z.object({
  fileId: z.uuid(),
});
