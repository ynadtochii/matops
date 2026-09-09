"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import { toast } from "@matops/ui/toast";

import { shareLink, useCanShare } from "~/lib/share";
import { useTRPC } from "~/trpc/react";
import { SectionHeading } from "./primitives";

const QrPoster = dynamic(() => import("./qr-poster").then((m) => m.QrPoster), {
  loading: () => (
    <div className="border-border mx-auto h-[336px] w-full max-w-xs animate-pulse rounded-lg border bg-white" />
  ),
});

/**
 * Public booking (spec O6, ADR 115). The master switch for the whole public
 * surface, the publishable key, the optional website allowlist, and the shared
 * `/book/<code>` link the owner sends when someone asks "when can I try a
 * class?". Owner-only. Nothing is shared until the owner also ticks a class.
 */
export function PublicBooking({ academyName }: { academyName: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const settings = useQuery(trpc.academy.publicApi.queryOptions());
  const shareable = useCanShare();

  const origin = useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => "",
  );

  const refresh = () =>
    queryClient.invalidateQueries(trpc.academy.publicApi.pathFilter());
  const onError = (err: { message: string }) =>
    toast.error(err.message || "Couldn't save. Try again.");

  const setEnabled = useMutation(
    trpc.academy.setPublicApi.mutationOptions({
      onSuccess: async (next) => {
        await refresh();
        toast.success(
          next.enabled ? "Public booking is on" : "Public booking is off",
        );
      },
      onError,
    }),
  );
  if (settings.isPending || settings.isError) return null;

  const { enabled, publicCode } = settings.data;
  const path = `/book/${publicCode}`;
  const url = origin ? `${origin}${path}` : path;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <SectionHeading>Public booking</SectionHeading>
        <p className="text-muted-foreground text-sm">
          Lets someone book a class without an account. They become a drop-in
          lead, never a member. Only the classes you tick as shared appear, and
          no visitor ever sees how full a class is or who is coming.
        </p>
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm sm:min-h-9">
        <input
          type="checkbox"
          className="accent-brand size-4"
          checked={enabled}
          disabled={setEnabled.isPending}
          onChange={(e) => setEnabled.mutate({ enabled: e.target.checked })}
        />
        Public booking is on
      </label>

      {enabled && (
        <>
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              Send this link when someone asks about training. It works with no
              website at all.
            </p>
            <QrPoster
              url={url}
              title={academyName}
              caption="Scan to book a class"
              codeLabel={`Booking QR code for ${academyName}`}
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
                        title: `Book a class at ${academyName}`,
                        text: "Pick a class and book here:",
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
          </div>
        </>
      )}
    </section>
  );
}
