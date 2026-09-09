import type { MetadataRoute } from "next";

/**
 * PWA manifest (ADR 42 — owner mobile = installable web app, not a native app).
 * Served by Next at `/manifest.webmanifest`; makes the owner/instructor web app
 * installable to the home screen on iOS + Android so on-the-mat jobs (attendance,
 * cancel a class, share a link, approve a join) are one tap away. Standalone
 * display + brand theme so it launches like an app. No offline / service worker
 * in v1 — that (and native push) is the deferred-native tail (ADR 42 cuts).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "MatOps",
    short_name: "MatOps",
    description:
      "Book your classes, run your schedule, take attendance. For grappling academies.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#6a4dff",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
