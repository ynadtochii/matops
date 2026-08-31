"use client";

import { useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PUBLIC_API_BASE } from "@matops/domain";
import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import { Label } from "@matops/ui/label";
import { Textarea } from "@matops/ui/textarea";
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
  const [originDraft, setOriginDraft] = useState<string | null>(null);
  const shareable = useCanShare();

  const origin = useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => "",
  );

  const refresh = () =>
    queryClient.invalidateQueries(trpc.academy.publicApi.pathFilter());
  const onError = (err: { message: string }) =>
    toast.error(err.message || "Could not save");

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
  const rotate = useMutation(
    trpc.academy.rotatePublicApiKey.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success("New key created. Update your website.");
      },
      onError,
    }),
  );
  const saveOrigins = useMutation(
    trpc.academy.setPublicApiOrigins.mutationOptions({
      onSuccess: async () => {
        await refresh();
        setOriginDraft(null);
        toast.success("Allowed websites saved");
      },
      onError,
    }),
  );

  if (settings.isPending || settings.isError) return null;

  const { enabled, apiKey, origins, publicCode } = settings.data;
  const path = `/book/${publicCode}`;
  const url = origin ? `${origin}${path}` : path;
  const apiUrl = origin ? `${origin}${PUBLIC_API_BASE}` : PUBLIC_API_BASE;
  const shownOrigins = originDraft ?? origins.join("\n");
  const originsDirty = shownOrigins !== origins.join("\n");

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

          <div className="flex flex-col gap-2">
            <Label htmlFor="public-api-key">API key for your website</Label>
            <p className="text-muted-foreground text-sm">
              Whoever builds your site sends this key with every request to{" "}
              <code className="break-all">{apiUrl}</code>. It is not a password:
              it names your gym and can be replaced at any time.
            </p>
            <div className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
              <code id="public-api-key" className="text-sm break-all">
                {apiKey}
              </code>
              <div className="flex gap-2">
                {apiKey && (
                  <CopyButton
                    value={apiKey}
                    label="Copy key"
                    toastMessage="Key copied"
                  />
                )}
                <Button
                  size="sm"
                  variant="outline"
                  busy={rotate.isPending}
                  disabled={rotate.isPending}
                  onClick={() => rotate.mutate()}
                >
                  New key
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="public-origins">Allowed websites</Label>
            <p className="text-muted-foreground text-sm">
              One address per line, like https://yourgym.com. Leave it empty to
              allow any website.
            </p>
            <Textarea
              id="public-origins"
              rows={3}
              value={shownOrigins}
              onChange={(e) => setOriginDraft(e.target.value)}
              placeholder="https://yourgym.com"
            />
            {originsDirty && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  busy={saveOrigins.isPending}
                  disabled={saveOrigins.isPending}
                  onClick={() =>
                    saveOrigins.mutate({
                      origins: shownOrigins
                        .split("\n")
                        .map((l) => l.trim())
                        .filter((l) => l.length > 0),
                    })
                  }
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOriginDraft(null)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
