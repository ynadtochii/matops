"use client";

import { useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";

import { Button } from "@matops/ui/button";
import { toast } from "@matops/ui/toast";

import { shareLink, useCanShare } from "~/lib/share";
import { SectionHeading } from "./primitives";

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
      <style>{`@media print{body *{visibility:hidden}.qr-print,.qr-print *{visibility:visible}.qr-print{position:fixed;inset:0;margin:auto;height:max-content}}`}</style>
      <SectionHeading>Venue check-in QR</SectionHeading>
      <p className="text-muted-foreground text-sm">
        Print this poster for your gym. First-time visitors scan it to check in
        and leave their details — no app needed.
      </p>

      <div className="qr-print border-border mx-auto flex w-full max-w-xs flex-col items-center gap-4 rounded-lg border bg-white p-8 text-center">
        <QRCodeSVG
          value={url}
          size={200}
          level="M"
          marginSize={4}
          bgColor="#ffffff"
          fgColor="#000000"
        />
        <div>
          <p className="text-lg font-semibold text-black">{academyName}</p>
          <p className="text-sm text-neutral-500">Scan to check in</p>
        </div>
      </div>

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
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(url);
              toast.success("Link copied");
            }}
          >
            Copy link
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            Print poster
          </Button>
        </div>
      </div>
    </section>
  );
}
