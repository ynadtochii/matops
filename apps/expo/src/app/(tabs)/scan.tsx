import { useCallback, useRef, useState } from "react";
import { Linking } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect, useRouter } from "expo-router";

import { parseCheckInLink } from "@matops/domain";

import { AppHeader } from "~/components/app-header";
import {
  Button,
  Heading,
  Muted,
  Screen,
  Txt,
  Stack as UIStack,
} from "~/components/ui";

export default function Scan() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  const start = useCallback(async () => {
    setError(null);
    handled.current = false;
    if (!CameraView.isModernBarcodeScannerAvailable) {
      setError(
        "This phone can't open a scanner. Point your camera app at the poster instead.",
      );
      return;
    }
    const status = await requestPermission();
    if (!status.granted) return;
    await CameraView.launchScanner({ barcodeTypes: ["qr"] });
  }, [requestPermission]);

  useFocusEffect(
    useCallback(() => {
      const sub = CameraView.onModernBarcodeScanned((event) => {
        if (handled.current) return;
        handled.current = true;
        // Dismiss before parsing: the sheet hides anything we render below.
        void CameraView.dismissScanner();
        const academyId = parseCheckInLink(event.data);
        if (!academyId) {
          setError("That's not a check-in code. Scan the poster at your gym.");
          return;
        }
        router.replace({
          pathname: "/checkin/[academyId]",
          params: { academyId },
        });
      });
      void start();
      return () => {
        sub.remove();
        void CameraView.dismissScanner();
      };
    }, [start, router]),
  );

  const blocked = permission && !permission.granted && !permission.canAskAgain;

  return (
    <Screen header={<AppHeader />}>
      <UIStack gap={24}>
        <Heading>Check in</Heading>
        <Muted>
          Point your camera at the QR poster at your gym. We&apos;ll book you
          into the class running now and mark you present.
        </Muted>

        {error ? (
          <Txt size={14} tone="error">
            {error}
          </Txt>
        ) : null}

        {blocked ? (
          <UIStack gap={12}>
            <Txt size={14} tone="muted">
              Camera access is off for matops. Turn it on to scan.
            </Txt>
            <Button
              label="Open settings"
              variant="outline"
              onPress={() => void Linking.openSettings()}
            />
          </UIStack>
        ) : (
          <Button label="Scan gym QR" onPress={() => void start()} />
        )}
      </UIStack>
    </Screen>
  );
}
