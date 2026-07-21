import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Expo push registration (Phase 4, docs/issues/17). Pure Expo side — asks for
 * permission and resolves the device's Expo push token. The tRPC `pushToken`
 * mutations persist it server-side. Push delivery is DEVICE-ONLY (needs a real
 * device + an EAS project id, which lands with the Phase 5 launch infra) — on a
 * simulator, or with no project id / denied permission, this no-ops so the app
 * still runs everywhere. See docs/mobile-device-test.md.
 */

const STORED_TOKEN_KEY = "matops.pushToken";
const ENABLED_KEY = "matops.pushEnabled";

export interface PushRegistration {
  token: string;
  platform: "ios" | "android";
}

/** The EAS project id, needed by `getExpoPushTokenAsync` (absent until Phase 5). */
function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

/**
 * Ask for notification permission and resolve this device's Expo push token, or
 * null when unavailable (simulator, denied, or no EAS project id yet). Never
 * throws — a failure just means "no push on this device".
 */
export async function getPushToken(): Promise<PushRegistration | null> {
  if (!Device.isDevice) return null; // Simulators cannot receive push.

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) {
    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.granted;
  }
  if (!granted) return null;

  const id = projectId();
  if (!id) return null; // No EAS project yet (Phase 5) — cannot mint a token.

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({
      projectId: id,
    });
    return { token: data, platform: Platform.OS === "ios" ? "ios" : "android" };
  } catch (err) {
    console.warn("[push] could not get Expo push token", err);
    return null;
  }
}

/** Remember the registered token so we can unregister it on sign-out. */
export async function rememberPushToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(STORED_TOKEN_KEY, token);
}

/** The token registered on this device, if any. */
export function storedPushToken(): string | null {
  return SecureStore.getItem(STORED_TOKEN_KEY);
}

/** Forget the stored token (after unregistering on sign-out). */
export async function forgetPushToken(): Promise<void> {
  await SecureStore.deleteItemAsync(STORED_TOKEN_KEY);
}

/**
 * The device's "push notifications on" preference (spec S7). Defaults to on —
 * absence of a stored value means the student never turned them off. This is the
 * whole toggle: off simply means we don't register a token, so nothing is sent.
 */
export function pushEnabled(): boolean {
  return SecureStore.getItem(ENABLED_KEY) !== "off";
}

/** Persist the push preference. */
export async function setPushEnabled(on: boolean): Promise<void> {
  await SecureStore.setItemAsync(ENABLED_KEY, on ? "on" : "off");
}
