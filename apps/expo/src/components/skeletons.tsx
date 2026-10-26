import { View } from "react-native";

import { useTheme } from "./theme";
import { List } from "./ui";

export function Bar({
  width,
  height = 14,
}: {
  width?: number | `${number}%`;
  height?: number;
}) {
  const theme = useTheme();
  return (
    <View
      style={{ width, height, borderRadius: 4, backgroundColor: theme.muted }}
    />
  );
}

function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading">
      <List>
        {Array.from({ length: rows }, (_, i) => (
          <View key={i} style={{ gap: 8, padding: 14 }}>
            <Bar width="70%" />
            <Bar width="45%" height={11} />
          </View>
        ))}
      </List>
    </View>
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return <SkeletonRows rows={lines} />;
}

export function RankSkeleton() {
  return <SkeletonRows rows={2} />;
}
export function ScheduleSkeleton({ days = 3 }: { days?: number }) {
  return <SkeletonRows rows={days} />;
}
export const MyClassesSkeleton = SkeletonRows;
export const NotificationsSkeleton = SkeletonRows;
export const ClassDetailSkeleton = SkeletonRows;
