import { z } from "zod/v4";

import { lineText, OpaqueTokenSchema } from "./fields";

// ─── Push notifications (Phase 4, slice 4.1) ─────────────────────────────────

/**
 * Register a device's Expo push token (docs/issues/17). Token is user-global —
 * the router keys it by the authenticated user, not an academy. Expo tokens look
 * like `ExponentPushToken[xxxxxxxx]`.
 */
export const RegisterPushTokenSchema = z.object({
  token: OpaqueTokenSchema,
  platform: z.enum(["ios", "android"]),
  deviceId: lineText(0, 200).optional(),
});
export type RegisterPushTokenInput = z.infer<typeof RegisterPushTokenSchema>;

/** Remove a device's push token (on sign-out). */
export const UnregisterPushTokenSchema = z.object({
  token: OpaqueTokenSchema,
});
export type UnregisterPushTokenInput = z.infer<
  typeof UnregisterPushTokenSchema
>;
