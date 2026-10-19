import { useEffect, useRef } from "react";
import { ScrollView, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  dayLongFmt,
  groupByDay,
  notificationKindLabel,
  timeFmt,
} from "@matops/domain";

import type { RouterOutputs } from "~/utils/api";
import { useRefreshControl } from "~/components/refresh";
import { NotificationsSkeleton } from "~/components/skeletons";
import {
  EmptyState,
  ErrorState,
  Heading,
  List,
  ListRow,
  Screen,
  Txt,
  useTheme,
} from "~/components/ui";
import { trpc } from "~/utils/api";

type FeedItem = RouterOutputs["notification"]["list"][number];

/**
 * The notification center on mobile (spec S13; ADR 77) — the twin of the web
 * screen, minus the owner's compose box. Opening it marks the feed read once;
 * the rows keep their unread dot for this render so the reader still sees what
 * was new. Only a class link opens somewhere: the rest of the web links have no
 * mobile route, so those rows just read.
 */
export default function Notifications() {
  const queryClient = useQueryClient();
  const feed = useQuery(trpc.notification.list.queryOptions());
  const markAllRead = useMutation(
    trpc.notification.markAllRead.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.notification.unreadCount.queryKey(),
        }),
    }),
  );

  const marked = useRef(false);
  const unread = feed.data?.some((n) => n.readAt === null) ?? false;
  useEffect(() => {
    if (marked.current || !unread) return;
    marked.current = true;
    markAllRead.mutate();
  }, [unread, markAllRead]);

  const days = groupByDay(
    (feed.data ?? []).map((n) => ({ ...n, startsAt: n.createdAt })),
  );
  const refreshControl = useRefreshControl();

  return (
    <Screen>
      <Stack.Screen options={{ title: "Notifications" }} />
      <View style={{ marginBottom: 16 }}>
        <Heading>Notifications</Heading>
      </View>

      {feed.isPending ? (
        <NotificationsSkeleton />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 20, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {feed.isError ? (
            <ErrorState
              label="your notifications"
              onRetry={() => void feed.refetch()}
            />
          ) : days.length === 0 ? (
            <EmptyState
              title="No notifications yet."
              body="Class changes, payment reminders and gym news show up here."
            />
          ) : (
            days.map(([key, rows]) => (
              <View key={key} style={{ gap: 8 }}>
                <DayRule
                  label={dayLongFmt.format(new Date(`${key}T12:00:00`))}
                />
                <List>
                  {rows.map((n) => (
                    <Row key={n.id} n={n} />
                  ))}
                </List>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

function DayRule({ label }: { label: string }) {
  return (
    <View style={{ paddingHorizontal: 2 }}>
      <Txt size={13} weight={500} tone="secondary">
        {label}
      </Txt>
    </View>
  );
}

function Row({ n }: { n: FeedItem }) {
  const router = useRouter();
  const t = useTheme();
  const classId = n.link?.startsWith("/class/")
    ? n.link.slice("/class/".length)
    : null;

  return (
    <ListRow
      onPress={
        classId
          ? () =>
              router.push({ pathname: "/class/[id]", params: { id: classId } })
          : undefined
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {n.readAt === null ? (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: t.foreground,
            }}
          />
        ) : null}
        <Txt
          size={15}
          weight={n.readAt === null ? 600 : 500}
          style={{ flex: 1 }}
          numberOfLines={2}
        >
          {n.title}
        </Txt>
        <Txt data size={12} tone="muted">
          {timeFmt.format(new Date(n.createdAt))}
        </Txt>
      </View>
      <Txt size={13} tone="muted" lineHeight={19} style={{ marginTop: 4 }}>
        {n.body}
      </Txt>
      <View style={{ marginTop: 8 }}>
        <Txt size={12} weight={500} tone="muted">
          {notificationKindLabel(n.kind)}
        </Txt>
      </View>
    </ListRow>
  );
}
