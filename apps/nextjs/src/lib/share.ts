import { useSyncExternalStore } from "react";

import { toast } from "@matops/ui/toast";

/**
 * Share a link the phone-native way (ADR 42). Installed as a PWA, the owner can
 * hand off a join link or venue QR through the OS share sheet — text a link,
 * drop it in WhatsApp — instead of copy-then-paste. Falls back to the clipboard
 * (with a toast) when the Web Share API is missing (most desktop browsers) or
 * the user dismisses the sheet.
 *
 * Returns nothing; it owns its own user feedback. Kept UI-free so it stays
 * testable and reusable across the invite + venue screens.
 */
export async function shareLink(opts: {
  url: string;
  title?: string;
  text?: string;
}): Promise<void> {
  const { url, title, text } = opts;
  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await navigator.share({ url, title, text });
      return;
    } catch (err) {
      // AbortError = the user closed the sheet on purpose; do nothing.
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Any other failure (e.g. share not allowed) falls through to copy.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  } catch {
    toast.error("Could not share the link");
  }
}

// The share sheet is a static browser capability — it never changes after load,
// so the store never emits.
const noopSubscribe = () => () => undefined;

/**
 * Whether the OS share sheet is available — gates the "Share" button. Reads
 * `navigator` through `useSyncExternalStore` with a `false` server snapshot, so
 * SSR and the first client render agree (no hydration mismatch) without an
 * effect or a lint suppression.
 */
export function useCanShare(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => "share" in navigator,
    () => false,
  );
}
