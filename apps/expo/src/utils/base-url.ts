import Constants from "expo-constants";

/**
 * Production/preview builds get EXPO_PUBLIC_API_URL baked in at build time via
 * eas.json's per-profile `env` (Expo inlines EXPO_PUBLIC_* vars automatically).
 * Dev falls back to deriving the host machine's IP from Metro so physical
 * devices on the same network can reach the local API.
 */
export const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  /**
   * Gets the IP address of your host-machine. If it cannot automatically find it,
   * you'll have to manually set it. The web/API dev server runs on port 3004 (see
   * apps/nextjs `dev` script — 3000 is kept free on purpose).
   */
  const debuggerHost = Constants.expoConfig?.hostUri;
  const localhost = debuggerHost?.split(":")[0];

  if (!localhost) {
    throw new Error(
      "Failed to get localhost. Set EXPO_PUBLIC_API_URL to point to your API server.",
    );
  }
  return `http://${localhost}:3004`;
};
