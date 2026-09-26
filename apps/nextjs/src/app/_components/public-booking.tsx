"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import { Label } from "@matops/ui/label";
import { Switch } from "@matops/ui/switch";
import { toast } from "@matops/ui/toast";

import { shareLink, useCanShare } from "~/lib/share";
import { useTRPC } from "~/trpc/react";
import { SectionHeading, SettingsRow } from "./primitives";
import { SkeletonControlPanel } from "./skeletons";
import { ErrorState } from "./states";

const QrPoster = dynamic(() => import("./qr-poster").then((m) => m.QrPoster), {
  loading: () => (
    <div className="bg-muted size-64 animate-pulse rounded-lg motion-reduce:animate-none" />
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
  if (settings.isPending) {
    return (
      <section className="flex flex-col gap-4">
        <SectionHeading>Public booking</SectionHeading>
        <SkeletonControlPanel />
      </section>
    );
  }

  if (settings.isError) {
    return (
      <section className="flex flex-col gap-4">
        <SectionHeading>Public booking</SectionHeading>
        <ErrorState
          label="public booking settings"
          onRetry={() => void settings.refetch()}
        />
      </section>
    );
  }

  const { enabled, publicCode } = settings.data;
  const path = `/book/${publicCode}`;
  const url = origin ? `${origin}${path}` : path;

  return (
    <section className="flex flex-col gap-4">
      <SectionHeading>Public booking</SectionHeading>
      <div
        className={cn(
          "border-border bg-card overflow-hidden rounded-lg border",
          enabled && "grid lg:grid-cols-[minmax(0,1fr)_auto]",
        )}
      >
        <div className="divide-border flex min-w-0 flex-col divide-y">
          <SettingsRow
            title={
              <Label
                htmlFor="public-booking-enabled"
                className="text-foreground"
              >
                Allow public booking
              </Label>
            }
            description={
              <span id="public-booking-hint">
                Let someone book a class without an account. They become a
                visitor lead, never a member. Only shared classes appear.
                Visitors never see attendance or capacity.
              </span>
            }
          >
            <Switch
              id="public-booking-enabled"
              aria-describedby="public-booking-hint"
              checked={enabled}
              disabled={setEnabled.isPending}
              onCheckedChange={(checked) =>
                setEnabled.mutate({ enabled: checked })
              }
            />
          </SettingsRow>

          {enabled && (
            <SettingsRow
              stacked
              description="Send this link when someone asks about training. It works with no website at all."
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <code className="text-foreground-secondary font-mono text-sm break-all">
                  {url}
                </code>
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
            </SettingsRow>
          )}
        </div>

        {enabled && (
          <aside className="border-border flex items-center justify-center border-t p-4 lg:border-t-0 lg:border-l">
            <QrPoster
              compact
              url={url}
              title={academyName}
              caption="Scan to book a class"
              codeLabel={`Booking QR code for ${academyName}`}
            />
          </aside>
        )}
      </div>
    </section>
  );
}
