import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { DAY_LABELS, lastClassLabel } from "@matops/domain";

import { SkeletonStatsCard } from "~/components/skeletons";
import {
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
  Stat,
  Txt,
} from "~/components/ui";
import { trpc } from "~/utils/api";

/**
 * The student "My Training" card (spec S7, slice B.1 — ADR 39). Reads
 * `stats.me` and shows total, this month, the week streak, plus a favorite +
 * last-class line. Owns its own card-sized loading / empty / error states.
 */
export function MyTrainingCard() {
  const stats = useQuery(trpc.stats.me.queryOptions());

  const title = <Eyebrow>My training</Eyebrow>;

  if (stats.isPending) {
    return (
      <View style={{ gap: 12 }}>
        {title}
        <SkeletonStatsCard />
      </View>
    );
  }

  if (stats.isError) {
    return (
      <View style={{ gap: 12 }}>
        {title}
        <ErrorState
          label="your training stats"
          onRetry={() => void stats.refetch()}
        />
      </View>
    );
  }

  const s = stats.data;

  if (s.total === 0) {
    return (
      <View style={{ gap: 12 }}>
        {title}
        <EmptyState
          title="No sessions yet."
          body="Check in at your next class to start tracking your training."
        />
      </View>
    );
  }

  const favorite = [
    s.favoriteDiscipline?.toUpperCase(),
    s.favoriteWeekday != null ? DAY_LABELS[s.favoriteWeekday] : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={{ gap: 12 }}>
      {title}
      <Card variant="filled" style={{ gap: 16 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Stat value={String(s.total)} label="Sessions" />
          <Stat value={String(s.thisMonth)} label="This month" />
          <Stat value={String(s.streakWeeks)} label="Week streak" />
        </View>
        <View style={{ gap: 4 }}>
          {favorite ? (
            <Txt size={14}>
              Favorite:{" "}
              <Txt size={14} weight={600}>
                {favorite}
              </Txt>
            </Txt>
          ) : null}
          {s.daysSinceLastClass != null ? (
            <Txt size={14} tone="muted">
              Last class: {lastClassLabel(s.daysSinceLastClass)}
            </Txt>
          ) : null}
        </View>
      </Card>
    </View>
  );
}
