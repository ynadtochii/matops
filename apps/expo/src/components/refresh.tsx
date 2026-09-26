import { useCallback, useState } from "react";
import { RefreshControl } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { useTheme } from "~/components/ui";

export function useRefreshControl() {
  const t = useTheme();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void queryClient
      .refetchQueries({ type: "active" })
      .finally(() => setRefreshing(false));
  }, [queryClient]);

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={t.mutedForeground}
      colors={[t.mutedForeground]}
      progressBackgroundColor={t.card}
    />
  );
}
