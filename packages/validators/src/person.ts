import { z } from "zod/v4";

import { EmailSchema, IdSchema, lineText, PhoneSchema } from "./fields";

const PersonContactSchema = z.object({
  name: lineText(1, 120),
  email: EmailSchema.nullish(),
  phone: PhoneSchema.nullish(),
});

export const PreviewCreatePersonSchema = PersonContactSchema;

const DuplicateDecisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("use_existing"), personId: z.uuid() }),
  z.object({
    kind: z.literal("create_separate"),
    reviewedPersonIds: z.array(z.uuid()).max(100),
  }),
]);

export const CreateStudentPersonSchema = PersonContactSchema.extend({
  entityId: IdSchema,
  duplicateDecision: DuplicateDecisionSchema.optional(),
});
