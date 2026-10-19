import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { disciplineHue } from "@matops/domain";

import { Txt, useTheme } from "~/components/ui";
import { trpc } from "~/utils/api";

export function useDisciplineColor() {
  const t = useTheme();
  const list = useQuery(trpc.discipline.list.queryOptions());
  const names = useMemo(
    () => (list.data ?? []).map((d) => d.name),
    [list.data],
  );
  return useCallback(
    (discipline: string | null) => {
      const hue = disciplineHue(discipline, names);
      const colors = [
        t.discipline1,
        t.discipline2,
        t.discipline3,
        t.discipline4,
        t.discipline5,
      ];
      return hue === null
        ? t.disciplineDefault
        : (colors[hue] ?? t.disciplineDefault);
    },
    [names, t],
  );
}

export function Discipline({ name }: { name: string }) {
  const colorOf = useDisciplineColor();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: colorOf(name),
        }}
      />
      <Txt size={13} tone="muted">
        {name}
      </Txt>
    </View>
  );
}
