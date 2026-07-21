"use client";

import { Button } from "@matops/ui/button";
import { toast } from "@matops/ui/toast";

/**
 * O6 Settings — the venue check-in link (spec O6, slice 3.5). One static per-gym
 * path that the gym prints as a QR poster: app-less visitors open it and land on
 * the public drop-in form. (Rendering the scannable QR image from this URL is a
 * small follow-up — needs a QR lib; the link itself is the venue check-in target.)
 */
export function Settings({ academyId }: { academyId: string }) {
  const path = `/checkin/${academyId}`;

  const copy = () => {
    // window is available in the click handler (client-only), so build the
    // absolute URL here rather than reading it during render (SSR-safe).
    const url = `${window.location.origin}${path}`;
    void navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Venue check-in</h2>
      <p className="text-muted-foreground text-sm">
        Print this link as a QR poster for your gym. First-time visitors scan it
        to check in and leave their details — no app needed.
      </p>
      <div className="bg-muted flex flex-wrap items-center justify-between gap-3 rounded-lg p-4">
        <code className="text-sm break-all">
          <span className="text-muted-foreground">your-site.com</span>
          {path}
        </code>
        <Button size="sm" variant="outline" onClick={copy}>
          Copy link
        </Button>
      </div>
    </section>
  );
}
