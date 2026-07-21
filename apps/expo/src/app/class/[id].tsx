import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { Banner, Heading, Loading, Muted, Screen } from "~/components/ui";
import { trpc } from "~/utils/api";
import { dayLongFmt, timeFmt } from "~/utils/format";

/** One labelled fact row on the detail screen. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-1">
      <Text className="text-muted-foreground text-xs font-semibold uppercase">
        {label}
      </Text>
      <Text className="text-foreground text-base">{children}</Text>
    </View>
  );
}

/**
 * Class detail (spec S5) — read-only. Shows title, discipline, day/time,
 * duration, instructor, and capacity. Booking (Book/Cancel) is Phase 3, so there
 * is no action here. Enrolled tier, so a pending member may open it too.
 */
export default function ClassDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery(trpc.class.get.queryOptions({ id }, { retry: false }));

  if (q.isPending) {
    return (
      <>
        <Stack.Screen options={{ title: "Class" }} />
        <Loading />
      </>
    );
  }

  if (q.isError) {
    return (
      <Screen className="justify-center gap-3">
        <Stack.Screen options={{ title: "Class" }} />
        <Heading>Class not found</Heading>
        <Muted>
          This class may have been removed. Go back to the schedule.
        </Muted>
      </Screen>
    );
  }

  const c = q.data;
  const cancelled = c.status === "cancelled";
  const start = new Date(c.startsAt);
  const over = c.capacity > 0 && c.bookingCount > c.capacity;
  const capacityLabel =
    c.capacity <= 0 ? "No limit" : `${c.bookingCount} / ${c.capacity}`;

  return (
    <Screen className="gap-6">
      <Stack.Screen options={{ title: "Class" }} />

      <View className="gap-2">
        <Heading>{c.title}</Heading>
        {c.discipline && (
          <Text className="text-muted-foreground text-xs uppercase">
            {c.discipline}
          </Text>
        )}
      </View>

      {cancelled && <Banner tone="warning">This class is cancelled.</Banner>}

      <View className="gap-5">
        <Field label="Day">{dayLongFmt.format(start)}</Field>
        <Field label="Time">
          {timeFmt.format(start)} · {c.durationMinutes} min
        </Field>
        <Field label="Instructor">{c.instructorName ?? "—"}</Field>
        <View className="gap-1">
          <Text className="text-muted-foreground text-xs font-semibold uppercase">
            Capacity
          </Text>
          <Text
            className={`text-base ${over ? "text-destructive" : "text-foreground"}`}
          >
            {capacityLabel}
            {over ? " · may be busy" : ""}
          </Text>
        </View>
      </View>

      <Muted>Booking opens soon.</Muted>
    </Screen>
  );
}
