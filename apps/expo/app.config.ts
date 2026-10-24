import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "MatOps",
  slug: "matops",
  scheme: "matops",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon-light.png",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    bundleIdentifier: "com.matops.app",
    supportsTablet: true,
    icon: {
      light: "./assets/icon-light.png",
      dark: "./assets/icon-dark.png",
    },
  },
  android: {
    package: "com.matops.app",
    adaptiveIcon: {
      foregroundImage: "./assets/icon-light.png",
      backgroundColor: "#000000",
    },
    edgeToEdgeEnabled: true,
  },
  experiments: {
    tsconfigPaths: true,
    typedRoutes: true,
    reactCanary: true,
    reactCompiler: true,
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-secure-store",
    "expo-web-browser",
    [
      "expo-image-picker",
      {
        photosPermission:
          "MatOps uses your photos so you can choose a profile picture.",
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    [
      // Dark-first: launch on the canonical pure-black surface.
      "expo-splash-screen",
      {
        backgroundColor: "#000000",
        image: "./assets/icon-dark.png",
        dark: {
          backgroundColor: "#000000",
          image: "./assets/icon-dark.png",
        },
      },
    ],
  ],
});
