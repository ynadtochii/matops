"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";

import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";

import { shareLink, useCanShare } from "~/lib/share";
import { SectionHeading } from "./primitives";

const QrPoster = dynamic(() => import("./qr-poster").then((m) => m.QrPoster), {
  loading: () => (
    <div className="border-border mx-auto h-[336px] w-full max-w-xs animate-pulse rounded-lg border bg-white" />
  ),
});

/**
 * Venue check-in QR (spec O6, ticket 08). Renders the public `/checkin/[id]`
 * URL as a scannable, printable poster with `qrcode.react` (SVG so it prints
 * crisp; black-on-white so dark mode never inverts the code). "Print poster"
 * isolates the poster via an @media print block — no PDF library.
 */
export function VenueCheckin({
  academyId,
  academyName,
}: {
  academyId: string;
  academyName: string;
}) {
  const path = `/checkin/${academyId}`;
  // The real origin is client-only; read it through `useSyncExternalStore` with
  // an empty server snapshot so the QR encodes an absolute URL after hydration
  // without an SSR mismatch (and without an effect).
  const origin = useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => "",
  );
  const shareable = useCanShare();
  const url = origin ? `${origin}${path}` : path;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Venue check-in QR</SectionHeading>
      <p className="text-muted-foreground text-sm">
        Print this poster for your gym. First-time visitors scan it to check in
        and leave their details — no app needed.
      </p>

      <QrPoster
        url={url}
        title={academyName}
        caption="Scan to check in"
        codeLabel={`Check-in QR code for ${academyName}`}
      />

      <div className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
        <code className="text-sm break-all">{url}</code>
        <div className="flex gap-2">
          {shareable && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void shareLink({
                  url,
                  title: `Check in at ${academyName}`,
                  text: "Scan or open this to check in:",
                })
              }
            >
              Share
            </Button>
          )}
          <CopyButton
            value={url}
            label="Copy link"
            toastMessage="Link copied"
          />
        </div>
      </div>
    </section>
  );
}
