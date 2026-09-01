import type { TRPCRouterRecord } from "@trpc/server";

import { sql } from "@matops/db";

import { enrolledProcedure, publicProcedure } from "../trpc";

export const systemRouter = {
  /** Unauthenticated liveness check. */
  health: publicProcedure.query(() => ({ ok: true as const })),

  /**
   * Authenticated, tenant-scoped ping — the Phase 0 exit proof. Runs inside the
   * tenant transaction, so the query below reads the RLS scope (`app.academy_id`)
   * that Postgres will use to filter every domain table. Real scoped domain reads
   * arrive with the scheduling tables in Phase 2.
   */
  ping: enrolledProcedure.query(async ({ ctx }) => {
    const scoped = await ctx.db.execute<{ academy_id: string | null }>(
      sql`select current_setting('app.academy_id', true) as academy_id`,
    );

    return {
      academyId: ctx.academyId,
      role: ctx.membership.role,
      status: ctx.membership.status,
      // Proves the resolver ran inside withScope with the RLS scope applied.
      rlsScope: scoped.rows[0]?.academy_id ?? null,
    };
  }),
} satisfies TRPCRouterRecord;
