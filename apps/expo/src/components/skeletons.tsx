import { View } from "react-native";

import { useTheme } from "./theme";
import { Card } from "./ui";

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
      style={{ width, height, borderRadius: 3, backgroundColor: theme.muted }}
    />
  );
}

function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={{ gap: 10 }}
    >
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i} style={{ gap: 8 }}>
          <Bar width="70%" />
          <Bar width="45%" height={11} />
        </Card>
      ))}
    </View>
  );
}

export function SkeletonCard({
  lines = 3,
}: {
  lines?: number;
  variant?: "filled" | "outline";
}) {
  return <SkeletonRows rows={lines} />;
}
export function DuesSkeleton() {
  return <SkeletonRows rows={2} />;
}
export function RankSkeleton() {
  return <SkeletonRows rows={2} />;
}
export function CheckinSkeleton({ rows = 2 }: { rows?: number }) {
  return <SkeletonRows rows={rows} />;
}
export function ScheduleSkeleton({ days = 3 }: { days?: number }) {
  return <SkeletonRows rows={days} />;
}
export const MyClassesSkeleton = SkeletonRows;
export const NotificationsSkeleton = SkeletonRows;
export const ClassDetailSkeleton = SkeletonRows;
