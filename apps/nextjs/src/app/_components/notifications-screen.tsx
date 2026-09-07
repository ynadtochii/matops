"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import {
  groupByDay,
  isStaff as isStaffOf,
  notificationKindLabel,
} from "@matops/domain";
import { cn } from "@matops/ui";

import { dayLongFmt, time24Fmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { AnnounceForm } from "./announce-form";
import { useEntity, useEntityHref } from "./entity";
import { PageHeader } from "./page-header";
import { cardClass, ENTER, Section, stagger } from "./primitives";
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

      {isStaff && <AnnounceForm scope="branch" />}

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
            {rows.map((n, i) => (
              <li key={n.id} style={stagger(i)} className={ENTER}>
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
