import { z } from "zod/v4";

import { IdSchema, lineText } from "./fields";

const ColumnMapSchema = z.object({
  name: lineText(1, 120),
  email: lineText(1, 120).optional(),
  phone: lineText(1, 120).optional(),
  branch: lineText(1, 120).optional(),
  plan: lineText(1, 120).optional(),
  startMonth: lineText(1, 120).optional(),
  paymentMonth: lineText(1, 120).optional(),
  paymentStatus: lineText(1, 120).optional(),
});

const ImportDefaultsSchema = z.object({
  entityId: IdSchema.optional(),
  planId: z.uuid().optional(),
  startMonth: z.iso.date().optional(),
  paymentMonth: z.iso.date().optional(),
  paymentStatus: z.enum(["paid", "unpaid"]).optional(),
});

export const StudentImportPreviewSchema = z.object({
  csv: z.string().min(1).max(1_048_576),
  columns: ColumnMapSchema,
  defaults: ImportDefaultsSchema,
});

const ImportDecisionSchema = z.discriminatedUnion("kind", [
  z.object({
    rowNumber: z.number().int().min(2).max(501),
    kind: z.literal("use_existing"),
    personId: z.uuid(),
  }),
  z.object({
    rowNumber: z.number().int().min(2).max(501),
    kind: z.literal("create_separate"),
    reviewedPersonIds: z.array(z.uuid()).max(100),
  }),
]);

export const StudentImportCommitSchema = StudentImportPreviewSchema.extend({
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  excludedRows: z.array(z.number().int().min(2).max(501)).max(500),
  decisions: z.array(ImportDecisionSchema).max(500),
});

export const OrganizationExportStartSchema = z.object({});

export const OrganizationExportPageSchema = z.object({
  dataset: z.enum([
    "people",
    "enrollments",
    "memberships",
    "membership_months",
    "payment_history",
    "attendance",
    "attendance_corrections",
  ]),
  exportedAt: z.iso.datetime(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(500),
});
