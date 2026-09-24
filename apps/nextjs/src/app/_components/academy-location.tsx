"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  academyCountry,
  academyMapUrl,
  DIAL_COUNTRIES,
  timeZoneOptions,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";
import { MapUrlSchema } from "@matops/validators";

import { useTRPC } from "~/trpc/react";
import { cardClass, SectionHeading } from "./primitives";
import { SkeletonControlPanel } from "./skeletons";
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
  const [bookingWindowError, setBookingWindowError] = useState<string | null>(
    null,
  );
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
        <SectionHeading>Branch rules and location</SectionHeading>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
          Set the local calendar, phone country, booking window, and address for
          this branch.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {settings.isPending ? (
          <>
            <SkeletonControlPanel />
            <SkeletonControlPanel />
            <SkeletonControlPanel />
          </>
        ) : settings.isError ? (
          <div className="md:col-span-2">
            <ErrorState
              label="branch rules"
              onRetry={() => void settings.refetch()}
            />
          </div>
        ) : (
          <>
            <article className={cn(cardClass(), "flex flex-col gap-3")}>
              <div>
                <h3 className="text-sm font-medium">Time zone</h3>
                <p className="text-muted-foreground mt-1 text-sm text-pretty">
                  Class times, weeks, and stats use this zone. Existing class
                  templates keep their current zone.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Label htmlFor="academy-time-zone" className="sr-only">
                  Academy time zone
                </Label>
                <Select
                  id="academy-time-zone"
                  className="max-w-xs flex-1"
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
              </div>
              {settings.data.drifting.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  Some class templates still run on{" "}
                  {settings.data.drifting.join(", ")}. This never changes the
                  time of a class that students have booked. Edit those
                  templates on Schedule if they should move.
                </p>
              )}
            </article>

            <article className={cn(cardClass(), "flex flex-col gap-3")}>
              <div>
                <h3 className="text-sm font-medium">Booking window</h3>
                <p className="text-muted-foreground mt-1 text-sm text-pretty">
                  Students can book classes on these branch calendar days.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Label htmlFor="booking-window-days">Days ahead</Label>
                <Input
                  id="booking-window-days"
                  type="number"
                  min={1}
                  max={90}
                  className="w-24"
                  defaultValue={settings.data.bookingWindowDays}
                  disabled={save.isPending}
                  aria-invalid={bookingWindowError ? true : undefined}
                  aria-describedby={
                    bookingWindowError ? "booking-window-error" : undefined
                  }
                  onChange={() => setBookingWindowError(null)}
                  onBlur={(event) => {
                    const bookingWindowDays = Number(event.target.value);
                    if (
                      !Number.isInteger(bookingWindowDays) ||
                      bookingWindowDays < 1 ||
                      bookingWindowDays > 90
                    ) {
                      setBookingWindowError(
                        "Use a whole number from 1 to 90 days.",
                      );
                      return;
                    }
                    setBookingWindowError(null);
                    if (bookingWindowDays !== settings.data.bookingWindowDays) {
                      save.mutate(
                        { bookingWindowDays },
                        {
                          onSuccess: () =>
                            toast.success("Booking window saved"),
                        },
                      );
                    }
                  }}
                />
              </div>
              {bookingWindowError && (
                <FieldError id="booking-window-error">
                  {bookingWindowError}
                </FieldError>
              )}
            </article>

            <article className={cn(cardClass(), "flex flex-col gap-3")}>
              <div>
                <h3 className="text-sm font-medium">Phone country</h3>
                <p className="text-muted-foreground mt-1 text-sm text-pretty">
                  Phone fields start with this country code. MatOps guesses from
                  the time zone until you save one.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Label htmlFor="academy-country" className="sr-only">
                  Academy country
                </Label>
                <Select
                  id="academy-country"
                  className="max-w-xs flex-1"
                  value={academyCountry(
                    settings.data.country,
                    settings.data.timeZone,
                  )}
                  disabled={save.isPending}
                  onChange={(e) => {
                    save.mutate(
                      { country: e.target.value },
                      { onSuccess: () => toast.success("Country saved") },
                    );
                  }}
                >
                  {DIAL_COUNTRIES.map((c) => (
                    <option key={c.iso} value={c.iso}>
                      {c.name} ({c.dial})
                    </option>
                  ))}
                </Select>
              </div>
              {!settings.data.country && (
                <p className="text-muted-foreground text-xs">
                  Guessed from {settings.data.timeZone}. Save it to make it
                  yours.
                </p>
              )}
            </article>
          </>
        )}

        <article className={cn(cardClass(), "flex flex-col gap-3")}>
          <div>
            <h3 className="text-sm font-medium">Address</h3>
            <p className="text-muted-foreground mt-1 text-sm text-pretty">
              Where the gym is. Students see it in the app and when they join.
            </p>
          </div>
          {editingAddress ? (
            <div className="flex flex-col gap-3">
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
              <div className="flex flex-col gap-1">
                <Label htmlFor="academy-map-url" className="text-sm">
                  Map link (optional)
                </Label>
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
                      className="text-foreground underline underline-offset-2"
                    >
                      Check the pin ↗
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
            </div>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-3">
              {address ? (
                <div className="flex flex-col gap-1">
                  <p className="text-foreground text-sm whitespace-pre-wrap">
                    {address}
                  </p>
                  {savedUrl && (
                    <a
                      href={savedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center text-xs underline underline-offset-2 sm:min-h-0"
                    >
                      {mapUrl ? "Open the pinned map" : "Open in Maps"}
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No address yet. Students have to ask where you train.
                </p>
              )}
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
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
