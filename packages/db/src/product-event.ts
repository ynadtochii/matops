import type { DbWriter } from "./tenant";
import { productEvent } from "./product-event-schema";

export type EventRole =
  "owner" | "manager" | "instructor" | "student" | "system";

const ROLES: EventRole[] = [
  "owner",
  "manager",
  "instructor",
  "student",
  "system",
];

export function eventRole(role: string | null | undefined): EventRole | null {
  return ROLES.find((r) => r === role) ?? null;
}

export interface ProductEventInput {
  organizationId: string;
  entityId?: string | null;
  name: string;
  actorRole?: EventRole | null;
}

async function write(
  kind: "milestone" | "activity",
  input: ProductEventInput,
  exec: DbWriter,
): Promise<void> {
  try {
    const insert = exec.insert(productEvent).values({
      kind,
      organizationId: input.organizationId,
      entityId: input.entityId ?? null,
      name: input.name,
      actorRole: input.actorRole ?? null,
    });
    await (kind === "milestone" ? insert.onConflictDoNothing() : insert);
  } catch (err) {
    console.error(`[product-event] ${input.name} not recorded`, err);
  }
}

export function recordMilestone(
  input: ProductEventInput,
  exec: DbWriter,
): Promise<void> {
  return write("milestone", input, exec);
}

export function recordActivity(
  input: ProductEventInput,
  exec: DbWriter,
): Promise<void> {
  return write("activity", input, exec);
}
