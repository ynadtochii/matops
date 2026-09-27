"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";

import { academyMapUrl, timeZoneOptions } from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { FOCUS_RING } from "@matops/ui/motion";
import { Select } from "@matops/ui/select";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";
import { MapUrlSchema } from "@matops/validators";

import { useTRPC } from "~/trpc/react";
import { LIST, SectionHeading, SettingsRow } from "./primitives";
import { Bar } from "./skeletons";
import { ErrorState } from "./states";

export function AcademyLocation({
  address,
  mapUrl,
}: {
  address: string | null;
  mapUrl: string | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const settings = useQuery(trpc.academy.settings.queryOptions());
  const current = settings.data?.timeZone;
  const zones = useMemo(() => timeZoneOptions(current), [current]);

  const [editingAddress, setEditingAddress] = useState(false);
  const [draft, setDraft] = useState(address ?? "");
  const [linkDraft, setLinkDraft] = useState(mapUrl ?? "");
  const linkError =
    linkDraft.trim() && !MapUrlSchema.safeParse(linkDraft.trim()).success
      ? "Paste a share link from Google Maps, Apple Maps, OpenStreetMap, or Waze."
      : null;

  const save = useMutation(
    trpc.academy.updateSettings.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.academy.pathFilter());
        setEditingAddress(false);
      },
      onError: () => toast.error("Couldn't save. Try again."),
    }),
  );

  const savedUrl = academyMapUrl(address, mapUrl);
  const draftUrl = academyMapUrl(draft, linkError ? null : linkDraft);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <SectionHeading>Location and time zone</SectionHeading>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
          Set the local calendar and address.
        </p>
      </div>
      {settings.isError && (
        <ErrorState
          label="location settings"
          onRetry={() => void settings.refetch()}
        />
      )}
      <div className={LIST}>
        {settings.isPending ? (
          <div
            role="status"
            aria-label="Loading"
            className="divide-border divide-y"
          >
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} aria-hidden className="flex flex-col gap-2 p-4">
                <Bar className="h-4 w-28" />
                <Bar className="h-3 w-72" />
              </div>
            ))}
          </div>
        ) : settings.isError ? null : (
          <>
            <SettingsRow
              title={<h3>Time zone</h3>}
              description={
                <>
                  Class times, weeks, and stats use this zone. Existing class
                  templates keep their current zone.
                  {settings.data.drifting.length > 0 && (
                    <span className="mt-1 block text-xs">
                      Some class templates still run on{" "}
                      {settings.data.drifting.join(", ")}. This never changes
                      the time of a class that students have booked. Edit those
                      templates on Schedule if they should move.
                    </span>
                  )}
                </>
              }
            >
              <Label htmlFor="academy-time-zone" className="sr-only">
                Academy time zone
              </Label>
              <Select
                id="academy-time-zone"
                className="w-full sm:w-64"
                value={settings.data.timeZone}
                disabled={save.isPending}
                onChange={(e) => {
                  save.mutate(
                    { timeZone: e.target.value },
                    { onSuccess: () => toast.success("Time zone saved") },
                  );
                }}
              >
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </Select>
            </SettingsRow>
          </>
        )}

        <SettingsRow
          title={<h3>Address</h3>}
          description={
            editingAddress ? (
              "Where the gym is. Students see it in the app and when they join."
            ) : (
              <>
                Where the gym is. Students see it in the app and when they join.
                {address ? (
                  <span className="mt-2 flex flex-col gap-1">
                    <span className="text-foreground whitespace-pre-wrap">
                      {address}
                    </span>
                    {savedUrl && (
                      <a
                        href={savedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "text-foreground decoration-muted-foreground inline-flex min-h-11 items-center self-start rounded-sm text-xs underline underline-offset-2 hover:decoration-current sm:min-h-0",
                          FOCUS_RING,
                        )}
                      >
                        {mapUrl ? "Open the pinned map" : "Open in Maps"}
                      </a>
                    )}
                  </span>
                ) : (
                  <span className="mt-2 block">
                    No address yet. Students have to ask where you train.
                  </span>
                )}
              </>
            )
          }
          stacked={editingAddress}
        >
          {editingAddress ? (
            <>
              <Label htmlFor="academy-address" className="sr-only">
                Academy address
              </Label>
              <Textarea
                id="academy-address"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                maxLength={200}
                autoFocus
                placeholder={"Sportyvna St 12, 2nd floor\nKyiv 01001, Ukraine"}
              />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="academy-map-url">Map link (optional)</Label>
                <Input
                  id="academy-map-url"
                  value={linkDraft}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  maxLength={500}
                  inputMode="url"
                  placeholder="https://maps.app.goo.gl/…"
                  aria-invalid={!!linkError}
                  aria-describedby="academy-map-url-help"
                  disabled={!draft.trim()}
                />
                {linkError ? (
                  <FieldError id="academy-map-url-help">{linkError}</FieldError>
                ) : (
                  <p
                    id="academy-map-url-help"
                    className="text-muted-foreground text-xs"
                  >
                    {!draft.trim()
                      ? "Type the address first. Students tap the address text, so a pin with nothing to read shows up nowhere."
                      : "Open your gym in Google or Apple Maps, tap Share, and paste the link here. Use it when searching the address alone lands on the wrong door."}
                  </p>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                {draftUrl ? (
                  <>
                    Students tap the address and land here.{" "}
                    <a
                      href={draftUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "text-foreground decoration-muted-foreground inline-flex items-center gap-0.5 rounded-sm underline underline-offset-2 hover:decoration-current",
                        FOCUS_RING,
                      )}
                    >
                      Check the pin
                      <ArrowUpRight aria-hidden className="size-3" />
                    </a>{" "}
                    before you save. If it is wrong, add a landmark or paste a
                    map link.
                  </>
                ) : (
                  "Students tap the address and land on a map."
                )}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  busy={save.isPending}
                  disabled={!!linkError}
                  onClick={() =>
                    save.mutate(
                      {
                        address: draft.trim(),
                        mapUrl: draft.trim() ? linkDraft.trim() : "",
                      },
                      { onSuccess: () => toast.success("Address saved") },
                    )
                  }
                >
                  Save address
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={save.isPending}
                  onClick={() => {
                    setDraft(address ?? "");
                    setLinkDraft(mapUrl ?? "");
                    setEditingAddress(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(address ?? "");
                setLinkDraft(mapUrl ?? "");
                setEditingAddress(true);
              }}
            >
              {address ? "Edit" : "Add address"}
            </Button>
          )}
        </SettingsRow>
      </div>
    </section>
  );
}
