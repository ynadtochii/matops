// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://dd68ca937e599d15df70204357fbf812@o4511954931089408.ingest.de.sentry.io/4511954936594512",

  integrations: [],

  tracesSampleRate: 0,
  enableLogs: false,

  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  ignoreErrors: [
    "ResizeObserver loop",
    "AbortError",
    "Failed to fetch",
    "NetworkError when attempting to fetch resource",
    "chrome-extension://",
    "moz-extension://",
  ],

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },
});

// Reception is a shared screen showing members' names, so it is never
// recorded. A replay is loaded once per document, and reception performs a full
// navigation into itself, so the path test here holds for the whole session
// (ADR 139).
if (!window.location.pathname.startsWith("/reception")) {
  void import("@sentry/nextjs").then((lazy) => {
    Sentry.addIntegration(lazy.replayIntegration());
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
