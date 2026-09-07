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

export const PersonIdSchema = z.object({ personId: z.uuid() });

export const GetPersonSchema = PersonIdSchema.extend({
  includeArchived: z.boolean().default(false),
});

export const PersonDirectorySchema = z
  .object({ includeArchived: z.boolean().default(false) })
  .optional();

export const PersonAccountCandidateSchema = z.object({
  personId: z.uuid(),
  email: EmailSchema,
});

export const LinkPersonAccountSchema = z.object({
  personId: z.uuid(),
  accountUserId: IdSchema,
  expectedUpdatedAt: z.iso.datetime(),
});

export const UnlinkPersonAccountSchema = z.object({
  personId: z.uuid(),
  expectedAccountUserId: IdSchema,
  expectedUpdatedAt: z.iso.datetime(),
});

export const GuardianCandidateSchema = z.object({
  studentPersonId: z.uuid(),
  email: EmailSchema,
});

export const PersonGuardianSchema = z.object({
  studentPersonId: z.uuid(),
  guardianUserId: IdSchema,
});

export const MySubjectsSchema = z
  .object({ entityId: IdSchema.optional() })
  .optional();

export const PersonScheduleSchema = z.object({
  entityId: IdSchema,
  personId: z.uuid(),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
});

export const PersonClassBookingSchema = z.object({
  entityId: IdSchema,
  personId: z.uuid(),
  classId: z.uuid(),
});

export type CreateStudentPersonInput = z.infer<
  typeof CreateStudentPersonSchema
>;
