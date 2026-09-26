"use client";

import { FOCUS_RING } from "@matops/ui/motion";

/**
 * "Open the app" member link (v1.8 slice 4). The gym QR poster still encodes this
 * public https page — a first-time, no-app visitor uses the drop-in form above.
 * A member with the app taps this to deep-link `matops://checkin/<academyId>`,
 * which opens the app's walk-in screen and books + marks them attended for the
 * class happening now. Custom scheme (ADR 31 — universal/App links deferred), so
 * the browser hands off to the app when it is installed.
 */
export function OpenInApp({ academyId }: { academyId: string }) {
  return (
    <div className="text-center">
      <p className="text-muted-foreground text-sm">
        Already a member?{" "}
        <a
          href={`matops://checkin/${academyId}`}
          className={`text-foreground decoration-muted-foreground inline-flex min-h-11 items-center rounded-sm font-medium underline underline-offset-4 hover:decoration-current sm:min-h-0 ${FOCUS_RING}`}
        >
          Open the app to check in
        </a>
      </p>
    </div>
  );
}
