import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";
import { getPushToken, pushEnabled, rememberPushToken } from "~/utils/push";

/**
 * Show notifications while the app is foregrounded (otherwise they only appear in
 * the tray). Set once at module load, per the Expo notifications contract.
 */
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
});

/**
 * Registers this device's Expo push token once the student is signed in and
 * routes notification taps to the right screen (Phase 4, docs/issues/17). Renders
 * nothing. Registration re-runs when the signed-in user changes so a token
 * follows the current account; the server upsert makes repeats idempotent. Push
 * is a no-op on simulators / without an EAS project id (see utils/push.ts).
 */
export function PushSync() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;
  const register = useMutation(trpc.pushToken.register.mutationOptions());
  const { mutate } = register;

  // Register the device token for the signed-in user.
  useEffect(() => {
    if (!userId || !pushEnabled()) return; // Student turned push off (S7).
    let cancelled = false;
    void getPushToken().then((reg) => {
      if (cancelled || !reg) return;
      mutate(reg, { onSuccess: () => void rememberPushToken(reg.token) });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, mutate]);

  // Navigate to the screen a tapped notification's `data.type` names (Phase 4).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const data = res.notification.request.content.data as {
        type?: unknown;
        classId?: unknown;
      };
      if (data.type === "class" && typeof data.classId === "string") {
        router.push({ pathname: "/class/[id]", params: { id: data.classId } });
      } else if (data.type === "approved") {
        router.push("/schedule");
      }
    });
    return () => sub.remove();
  }, [router]);

  return null;
}
