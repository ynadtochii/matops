import { TRPCError } from "@trpc/server";

import type { DbReader, SQL, TenantTx } from "@matops/db";
import { and, eq, inArray, isNull, sql } from "@matops/db";
import { classInstance } from "@matops/db/schema";

import { CLASS_NOT_FOUND } from "./messages";

export function liveClass(classId: string): SQL | undefined {
  return and(eq(classInstance.id, classId), isNull(classInstance.deletedAt));
}

interface ClassFacts {
  id: string;
  status: string;
  startsAt: Date;
  durationMinutes: number;
  deletedAt: Date | null;
}

export async function requireClassFacts(
  db: DbReader,
  classId: string,
): Promise<ClassFacts> {
  const [cls] = await db
    .select({
      id: classInstance.id,
      status: classInstance.status,
      startsAt: classInstance.startsAt,
      durationMinutes: classInstance.durationMinutes,
      deletedAt: classInstance.deletedAt,
    })
    .from(classInstance)
    .where(eq(classInstance.id, classId));
  if (!cls) {
    throw new TRPCError({ code: "NOT_FOUND", message: CLASS_NOT_FOUND });
  }
  return cls;
}

export async function claimSeat(db: TenantTx, classId: string): Promise<void> {
  await db
    .update(classInstance)
    .set({ bookingCount: sql`${classInstance.bookingCount} + 1` })
    .where(eq(classInstance.id, classId));
}

export async function releaseSeats(
  db: TenantTx,
  classIds: string[],
): Promise<void> {
  if (classIds.length === 0) return;
  await db
    .update(classInstance)
    .set({ bookingCount: sql`GREATEST(${classInstance.bookingCount} - 1, 0)` })
    .where(inArray(classInstance.id, classIds));
}
