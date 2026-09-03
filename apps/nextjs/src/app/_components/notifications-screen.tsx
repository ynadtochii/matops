"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import type { AnnouncementAudience } from "@matops/domain";
import {
  ANNOUNCEMENT_AUDIENCE_LABEL,
  ANNOUNCEMENT_AUDIENCES,
  groupByDay,
  isStaff as isStaffOf,
  notificationKindLabel,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";
import { AnnounceSchema } from "@matops/validators";

import { dayLongFmt, time24Fmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useEntity, useEntityHref } from "./entity";
import { PageHeader } from "./page-header";
import { cardClass, Section } from "./primitives";
import { SkeletonFeed } from "./skeletons";
import { EmptyState, ErrorState } from "./states";

type FeedItem = RouterOutputs["notification"]["list"][number];

/**
 * The notification center (v3.7, spec S13/O12; ADR 77). One feed per academy for
 * everyone in it, plus the staff compose box. Opening the screen marks the
 * feed read once, but the rows keep their unread dot for this render so the
 * reader can still see what was new.
 */
export function NotificationsScreen() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const academy = useEntity();
  const isStaff = isStaffOf(academy);

  const feed = useQuery(trpc.notification.list.queryOptions());
  const markAllRead = useMutation(
    trpc.notification.markAllRead.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.notification.unreadCount.queryKey(),
        }),
    }),
  );

  // Mark read once per visit, after the feed has actually arrived. The ref keeps
  // a refetch (window focus, an announcement posted) from firing it again.
  const marked = useRef(false);
  const unread = feed.data?.some((n) => n.readAt === null) ?? false;
  useEffect(() => {
    if (marked.current || !unread) return;
    marked.current = true;
    markAllRead.mutate();
  }, [unread, markAllRead]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Notifications"
        subtitle={`Everything ${academy.name} has sent you.`}
      />

      {isStaff && <ComposeAnnouncement />}

      {feed.isPending ? (
        <SkeletonFeed />
      ) : feed.isError ? (
        <ErrorState
          label="your notifications"
          onRetry={() => void feed.refetch()}
        />
      ) : feed.data.length === 0 ? (
        <EmptyState title="Nothing yet.">
          Class changes, payment reminders and gym news land here.
        </EmptyState>
      ) : (
        <Feed items={feed.data} />
      )}
    </div>
  );
}

function Feed({ items }: { items: FeedItem[] }) {
  const days = groupByDay(items.map((n) => ({ ...n, startsAt: n.createdAt })));
  return (
    <div className="flex flex-col gap-8">
      {days.map(([key, rows]) => (
        <Section
          key={key}
          label={dayLongFmt.format(rows[0]?.createdAt ?? new Date())}
        >
          <ul className="flex flex-col gap-2">
            {rows.map((n) => (
              <li key={n.id}>
                <FeedRow item={n} />
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const href = useEntityHref();
  const body = (
    <>
      <div className="flex items-baseline gap-2">
        {item.readAt === null && (
          <span
            aria-label="Unread"
            className="bg-brand mt-1.5 size-1.5 shrink-0 rounded-full"
          />
        )}
        <p className="flex-1 text-sm font-medium">{item.title}</p>
        <span className="text-muted-foreground shrink-0 font-mono text-[10px] tabular-nums">
          {time24Fmt.format(item.createdAt)}
        </span>
      </div>
      <p className="text-muted-foreground mt-1 text-sm whitespace-pre-line">
        {item.body}
      </p>
      <p className="text-muted-foreground mt-2 font-mono text-[10px] tracking-wide uppercase">
        {notificationKindLabel(item.kind)}
        {item.sentBy && ` · ${item.sentBy}`}
      </p>
    </>
  );

  // A link to the feed itself is not a link. Announcements used to store one,
  // so the row has to refuse it, not just the writer that stopped sending it.
  const link = item.link === "/notifications" ? null : item.link;
  if (!link) return <div className={cardClass()}>{body}</div>;
  return (
    <Link
      href={href(link)}
      className={cn(cardClass({ interactive: true }), "block")}
    >
      {body}
    </Link>
  );
}

const EMPTY_DRAFT = {
  title: "",
  body: "",
  audience: "all" as AnnouncementAudience,
};

/** Staff only: write gym news and send it to one audience (spec O12). */
function ComposeAnnouncement() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const counts = useQuery(trpc.notification.audienceCounts.queryOptions());
  const announce = useMutation(
    trpc.notification.announce.mutationOptions({
      onSuccess: (res) => {
        setDraft(EMPTY_DRAFT);
        toast.success(
          res.sent === 0
            ? "Nobody to send to yet"
            : `Posted to ${res.sent} ${res.sent === 1 ? "person" : "people"}`,
        );
        void queryClient.invalidateQueries({
          queryKey: trpc.notification.list.queryKey(),
        });
      },
      onError: (err) => toast.error(err.message || "Could not post"),
    }),
  );

  const reach = counts.data?.[draft.audience];
  const valid = AnnounceSchema.safeParse(draft).success;

  return (
    <form
      className={`${cardClass()} flex flex-col gap-4`}
      onSubmit={(e) => {
        e.preventDefault();
        announce.mutate(draft);
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
            {counts.data && (
              <span className="ml-1.5 font-mono text-[10px] tabular-nums">
                {counts.data[a]}
              </span>
            )}
          </button>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="submit" size="sm" disabled={!valid || announce.isPending}>
          {announce.isPending
            ? "Posting…"
            : reach == null
              ? "Post"
              : `Post to ${reach}`}
        </Button>
      </div>
    </form>
  );
}
