import { TRPCError } from "@trpc/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { eq } from "@matops/db";
import { memberNote } from "@matops/db/schema";

import type { Harness } from "./helpers";
import { createTRPCRouter, memberProcedure } from "../src/trpc";
import { harness, rejectionCode, seedAcademies } from "./helpers";

const A = "acad_rollback_a";
const OWNER_A = "u_rollback_owner";
const MEMBER_ROW = "m_rollback_probe";

const probeRouter = createTRPCRouter({
  writeThenThrow: memberProcedure.mutation(async ({ ctx }) => {
    await ctx.db.insert(memberNote).values({
      academyId: ctx.academyId,
      memberId: MEMBER_ROW,
      body: "written before the throw",
      authorId: ctx.session.user.id,
    });
    throw new TRPCError({ code: "CONFLICT", message: "second step failed" });
  }),
  writeThenReturn: memberProcedure.mutation(async ({ ctx }) => {
    await ctx.db.insert(memberNote).values({
      academyId: ctx.academyId,
      memberId: MEMBER_ROW,
      body: "written and returned",
      authorId: ctx.session.user.id,
    });
    return { ok: true as const };
  }),
});

describe("tenant transaction rollback", () => {
  let h: Harness;

  async function probeRows() {
    return h.exec
      .select({ body: memberNote.body })
      .from(memberNote)
      .where(eq(memberNote.memberId, MEMBER_ROW));
  }

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: A,
        code: "700030",
        members: [{ userId: OWNER_A, role: "owner", status: "active" }],
      },
    ]);
  });

  afterAll(() => h.close());

  it("discards every write when the resolver throws", async () => {
    const caller = probeRouter.createCaller(h.ctxFor(OWNER_A, A));
    expect(await rejectionCode(caller.writeThenThrow())).toBe("CONFLICT");
    expect(await probeRows()).toEqual([]);
  });

  it("keeps the write when the resolver returns", async () => {
    const caller = probeRouter.createCaller(h.ctxFor(OWNER_A, A));
    await caller.writeThenReturn();
    expect(await probeRows()).toEqual([{ body: "written and returned" }]);
  });
});
