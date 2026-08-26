import { z } from "zod/v4";

import { blockText, lineText } from "./fields";

// ─── Notification center (v3.7, ADR 77) ─────────────────────────────────────

/**
 * Owner-written gym news. The body is bounded at 1000 characters on purpose:
 * this is a notice, and anything longer belongs in a message the gym sends by
 * other means. Both fields go through the shared sanitizers first.
 */
export const AnnounceSchema = z.object({
  title: lineText(1, 80),
  body: blockText(1, 1000),
  audience: z.enum(["all", "students", "staff"]),
});
export type AnnounceInput = z.infer<typeof AnnounceSchema>;
