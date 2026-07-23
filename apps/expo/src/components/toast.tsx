import type { ReactNode } from "react";
import * as React from "react";
import { Animated, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Txt, useTheme } from "~/components/ui";

/**
 * A minimal toast (v1.8 slice 6) — the mobile app had no confirmation surface, so
 * a booking felt unfinished. `useToast().show("Booked — Tue 18:00")` slides a
 * short-lived strip up from the bottom, then fades. One message at a time; a new
 * show replaces the current one. No dependency — just Animated + a timer.
 */

interface ToastContextValue {
  show: (message: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const VISIBLE_MS = 2200;
const FADE_MS = 180;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = React.useState<string | null>(null);
  // A stable Animated.Value held as state (lazy init) — not a ref, so it is safe
  // to read during render for the toast's opacity style.
  const [opacity] = React.useState(() => new Animated.Value(0));
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = React.useCallback(
    (next: string) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setMessage(next);
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_MS,
          useNativeDriver: true,
        }).start(() => setMessage(null));
      }, VISIBLE_MS);
    },
    [opacity],
  );

  React.useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  const value = React.useMemo(() => ({ show }), [show]);

  return (
    <ToastContext value={value}>
      {children}
      {message !== null && <ToastHost message={message} opacity={opacity} />}
    </ToastContext>
  );
}

function ToastHost({
  message,
  opacity,
}: {
  message: string;
  opacity: Animated.Value;
}) {
  const t = useTheme();
  return (
    <SafeAreaView
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      edges={["bottom"]}
    >
      <View style={styles.anchor}>
        <Animated.View
          style={[
            styles.toast,
            {
              opacity,
              backgroundColor: t.card,
              borderColor: t.border,
            },
          ]}
        >
          <Txt size={14} weight={500} numberOfLines={2}>
            {message}
          </Txt>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

/** Fire toasts from any screen. Safe no-op if no provider is mounted. */
export function useToast(): ToastContextValue {
  const ctx = React.use(ToastContext);
  return ctx ?? { show: () => undefined };
}

const styles = StyleSheet.create({
  anchor: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  toast: {
    maxWidth: "100%",
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
