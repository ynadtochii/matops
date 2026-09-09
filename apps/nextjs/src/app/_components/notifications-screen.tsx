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
import { Button } from "@matops/ui/button";
import { toast } from "@matops/ui/toast";

import { dayLongFmt, time24Fmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
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
  const deliveryIssues = useQuery({
    ...trpc.notification.deliveryIssues.queryOptions(),
    enabled: isStaff,
  });
  const refreshIssues = () =>
    queryClient.invalidateQueries(
      trpc.notification.deliveryIssues.pathFilter(),
    );
  const sendRemaining = useMutation(
    trpc.notification.sendRemaining.mutationOptions({
      onSuccess: async (result) => {
        await refreshIssues();
        toast.success(`${result.delivery.accepted} emails accepted`);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const retryFailed = useMutation(
    trpc.notification.retryFailed.mutationOptions({
      onSuccess: async (result) => {
        await refreshIssues();
        toast.success(`${result.delivery.accepted} emails accepted`);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
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

      {isStaff && deliveryIssues.data && deliveryIssues.data.length > 0 && (
        <section className={cardClass()} aria-label="Email delivery issues">
          <h2 className="font-semibold">Email delivery</h2>
          <ul className="mt-3 space-y-3">
            {deliveryIssues.data.map((notice) => (
              <li key={notice.noticeId} className="border-border border-t pt-3">
                <p className="text-sm font-medium">{notice.subject}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {notice.pending} remaining, {notice.failed} failed,{" "}
                  {notice.unknown} unknown, {notice.noEmail} without email
                </p>
                <div className="mt-2 flex gap-2">
                  {notice.pending > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sendRemaining.isPending}
                      onClick={() =>
                        sendRemaining.mutate({ noticeId: notice.noticeId })
                      }
                    >
                      Send remaining
                    </Button>
                  )}
                  {notice.failed + notice.unknown > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={retryFailed.isPending}
                      onClick={() =>
                        retryFailed.mutate({ noticeId: notice.noticeId })
                      }
                    >
                      Retry failed
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {feed.isPending ? (
        <SkeletonFeed />
      ) : feed.isError ? (
        <ErrorState
          label="your notifications"
          onRetry={() => void feed.refetch()}
        />
      ) : feed.data.length === 0 ? (
        <EmptyState title="No notifications yet.">
          Class changes and membership updates show up here.
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
