import { and, eq, inArray } from "drizzle-orm";

import { user } from "./auth-schema";
import { db } from "./client";
import { pushToken } from "./push-token-schema";

/**
 * Push-token read/write helpers (Phase 4, docs/issues/17, 34). All run on the
 * trusted base connection — push tokens are user-global (no academy scope, no
 * RLS). The table itself is defined in ./push-token-schema.ts.
 */

export interface UpsertPushTokenInput {
  token: string;
  platform: string;
  deviceId?: string | null;
}

/**
 * Register (or refresh) a device's Expo push token for a user. Conflict on the
 * unique token reassigns it to the current user + refreshes platform/device, so
 * a token that moves between accounts on one device is never orphaned.
 */
export async function upsertPushToken(
  userId: string,
  input: UpsertPushTokenInput,
): Promise<void> {
  await db
    .insert(pushToken)
    .values({
      userId,
      token: input.token,
      platform: input.platform,
      deviceId: input.deviceId ?? null,
    })
    .onConflictDoUpdate({
      target: pushToken.token,
      set: {
        userId,
        platform: input.platform,
        deviceId: input.deviceId ?? null,
        updatedAt: new Date(),
      },
    });
}

/**
 * Remove one of a user's own tokens (called on sign-out so a shared device stops
 * receiving pushes). Scoped by `userId` as well as the token: the token string is
 * client-supplied, so without the owner filter any signed-in caller could silence
 * anyone else's notifications.
 */
export async function deletePushToken(
  userId: string,
  token: string,
): Promise<void> {
  await db
    .delete(pushToken)
    .where(and(eq(pushToken.userId, userId), eq(pushToken.token, token)));
}

/** A notification target: contact channels resolved for one user. */
export interface PushTarget {
  userId: string;
  email: string;
  name: string;
  tokens: string[];
}

/**
 * Resolve users → their email + all registered push tokens (base connection,
 * cross-academy). Users with no token still come back (email can still reach
 * them). Used by the API notify helper and the reminder cron.
 */
export async function getPushTargets(userIds: string[]): Promise<PushTarget[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
      token: pushToken.token,
    })
    .from(user)
    .leftJoin(pushToken, eq(pushToken.userId, user.id))
    .where(inArray(user.id, userIds));

  const byUser = new Map<string, PushTarget>();
  for (const r of rows) {
    const t: PushTarget = byUser.get(r.userId) ?? {
      userId: r.userId,
      email: r.email,
      name: r.name,
      tokens: [],
    };
    if (r.token) t.tokens.push(r.token);
    byUser.set(r.userId, t);
  }
  return [...byUser.values()];
}
