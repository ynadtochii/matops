"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AnnouncementAudience } from "@matops/domain";
import {
  ANNOUNCEMENT_AUDIENCE_LABEL,
  ANNOUNCEMENT_AUDIENCES,
} from "@matops/domain";
import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";
import { AnnounceSchema } from "@matops/validators";

import { useTRPC } from "~/trpc/react";
import { useOrganization } from "./entity";
import { cardClass } from "./primitives";

const EMPTY_DRAFT = {
  title: "",
  body: "",
  audience: "all" as AnnouncementAudience,
};

/**
 * Write gym news and send it (spec O12, ADR 127).
 *
 * One form, two levels. At a branch it posts there, which is what staff do. At
 * the organization it posts to the branches an owner ticks, and a person at two
 * of them gets one inbox row at each and one push.
 */
export function AnnounceForm({ scope }: { scope: "branch" | "organization" }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { entities } = useOrganization();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  // Every branch until somebody unticks one: that is what an owner means most
  // often, and it matches what the server does with an empty list.
  const [picked, setPicked] = useState<string[]>(() =>
    entities.map((e) => e.id),
  );
  const organization = scope === "organization";

  const branchCounts = useQuery({
    ...trpc.notification.audienceCounts.queryOptions(),
    enabled: !organization,
  });
  const orgCounts = useQuery({
    ...trpc.notification.audienceCountsAll.queryOptions({ entityIds: picked }),
    enabled: organization,
  });
  const counts = organization ? orgCounts.data : branchCounts.data;

  const done = async (people: number) => {
    setDraft(EMPTY_DRAFT);
    toast.success(
      people === 0
        ? "Nobody to send to yet"
        : `Posted to ${people} ${people === 1 ? "person" : "people"}`,
    );
    await queryClient.invalidateQueries({
      queryKey: trpc.notification.list.queryKey(),
    });
  };
  const onError = (err: { message: string }) =>
    toast.error(err.message || "Could not post");

  const announce = useMutation(
    trpc.notification.announce.mutationOptions({
      onSuccess: (res) => void done(res.sent),
      onError,
    }),
  );
  const announceAll = useMutation(
    trpc.notification.announceAll.mutationOptions({
      onSuccess: (res) => void done(res.pushed),
      onError,
    }),
  );

  const busy = announce.isPending || announceAll.isPending;
  const reach = counts?.[draft.audience];
  const valid =
    AnnounceSchema.safeParse(draft).success &&
    (!organization || picked.length > 0);

  return (
    <form
      className={`${cardClass()} flex flex-col gap-4`}
      onSubmit={(e) => {
        e.preventDefault();
        if (organization) {
          announceAll.mutate({ ...draft, entityIds: picked });
        } else {
          announce.mutate(draft);
        }
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="announce-title">Post an update</Label>
        <Input
          id="announce-title"
          value={draft.title}
          maxLength={80}
          placeholder="No class Friday"
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="announce-body">Message</Label>
        <Textarea
          id="announce-body"
          value={draft.body}
          maxLength={1000}
          rows={3}
          placeholder="The mats are being replaced. Normal schedule from Monday."
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        />
      </div>

      {organization && entities.length > 1 && (
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="text-muted-foreground mb-1.5 text-sm">
            Branches
          </legend>
          {entities.map((e) => {
            const on = picked.includes(e.id);
            return (
              <button
                key={e.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setPicked(
                    on ? picked.filter((id) => id !== e.id) : [...picked, e.id],
                  )
                }
                className={`min-h-11 rounded-md border px-3 py-1.5 text-sm transition-colors sm:min-h-0 ${
                  on
                    ? "border-brand bg-brand-wash text-brand-strong font-medium"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {e.name}
              </button>
            );
          })}
        </fieldset>
      )}

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Send to</legend>
        {ANNOUNCEMENT_AUDIENCES.map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={draft.audience === a}
            onClick={() => setDraft({ ...draft, audience: a })}
            className={`min-h-11 rounded-md border px-3 py-1.5 text-sm transition-colors sm:min-h-0 ${
              draft.audience === a
                ? "border-brand bg-brand-wash text-brand-strong font-medium"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {ANNOUNCEMENT_AUDIENCE_LABEL[a]}
            {counts && (
              <span className="ml-1.5 font-mono text-[10px] tabular-nums">
                {counts[a]}
              </span>
            )}
          </button>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="submit" size="sm" disabled={!valid || busy}>
          {busy ? "Posting…" : reach == null ? "Post" : `Post to ${reach}`}
        </Button>
      </div>
    </form>
  );
}
