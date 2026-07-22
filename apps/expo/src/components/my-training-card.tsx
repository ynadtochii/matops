import { ActivityIndicator, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { DAY_LABELS } from "@matops/domain";

import { EmptyState, ErrorState, useTheme } from "~/components/ui";
import { trpc } from "~/utils/api";

/** N-days-since phrasing for the "last class" line. */
function lastClassLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function StatTile({ value, label }: { value: string; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text
        style={{
          fontSize: 24,
          fontWeight: "700",
          color: t.foreground,
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: 0.3,
          color: t.mutedForeground,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * The student "My Training" card (spec S7, slice B.1 — ADR 39). Reads
 * `stats.me` (attended sessions at the active academy) and shows total, this
 * month, the week streak, plus a favorite + last-class line. Owns its own
 * card-sized loading / empty / error states. Mounted on the Training tab (B.2).
 */
export function MyTrainingCard() {
  const t = useTheme();
  const stats = useQuery(trpc.stats.me.queryOptions());

  const title = (
    <Text
      style={{
        fontSize: 12,
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: 0.3,
        color: t.mutedForeground,
      }}
    >
      My training
    </Text>
  );

  if (stats.isPending) {
    return (
      <View style={{ gap: 12 }}>
        {title}
        <View
          style={{
            borderRadius: 8,
            backgroundColor: t.muted,
            padding: 24,
            alignItems: "center",
          }}
        >
          <ActivityIndicator />
        </View>
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
      <View
        style={{
          borderRadius: 8,
          backgroundColor: t.muted,
          padding: 16,
          gap: 16,
        }}
      >
        <View style={{ flexDirection: "row", gap: 12 }}>
          <StatTile value={String(s.total)} label="Sessions" />
          <StatTile value={String(s.thisMonth)} label="This month" />
          <StatTile
            value={String(s.streakWeeks)}
            label={s.streakWeeks === 1 ? "Week streak" : "Weeks streak"}
          />
        </View>
        <View style={{ gap: 4 }}>
          {favorite ? (
            <Text style={{ fontSize: 14, color: t.foreground }}>
              Favorite: <Text style={{ fontWeight: "600" }}>{favorite}</Text>
            </Text>
          ) : null}
          {s.daysSinceLastClass != null ? (
            <Text style={{ fontSize: 14, color: t.mutedForeground }}>
              Last class: {lastClassLabel(s.daysSinceLastClass)}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
