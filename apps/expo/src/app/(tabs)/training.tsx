import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { nextClass, splitMyClasses } from "@matops/domain";

import type { RouterOutputs } from "~/utils/api";
import { MyTrainingCard } from "~/components/my-training-card";
import {
  Button,
  EmptyState,
  ErrorState,
  Heading,
  Loading,
  Mark,
  Screen,
  useTheme,
} from "~/components/ui";
import { trpc } from "~/utils/api";
import { dayLongFmt, timeFmt } from "~/utils/format";

type MyClass = RouterOutputs["booking"]["mine"][number];

function SectionLabel({ children }: { children: string }) {
  const t = useTheme();
  return (
    <Text
      style={{
        fontSize: 12,
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: 0.3,
        color: t.mutedForeground,
      }}
    >
      {children}
    </Text>
  );
}

/** The next upcoming class, shown large at the top of the tab (slice B.2 / C). */
function NextClassCard({ c, onPress }: { c: MyClass; onPress: () => void }) {
  const t = useTheme();
  const start = new Date(c.startsAt);
  return (
    <View style={{ gap: 12 }}>
      <SectionLabel>Next class</SectionLabel>
      <Pressable
        onPress={onPress}
        style={{
          borderRadius: 8,
          borderWidth: 1,
          borderColor: t.brand,
          backgroundColor: t.brandWash,
          padding: 16,
          gap: 4,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "700", color: t.foreground }}>
          {c.title}
        </Text>
        <Text style={{ fontSize: 14, color: t.foreground }}>
          {dayLongFmt.format(start)} · {timeFmt.format(start)}
        </Text>
        {c.bookingTier === "provisional" ? (
          <Text style={{ fontSize: 13, color: t.brandStrong }}>
            Pending approval
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

/** One row in the Upcoming or Past list. */
function ClassRow({
  c,
  onPress,
  action,
}: {
  c: MyClass;
  onPress: () => void;
  action?: React.ReactNode;
}) {
  const t = useTheme();
  const start = new Date(c.startsAt);
  const cancelled = c.status === "cancelled";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        backgroundColor: t.muted,
        borderRadius: 8,
        padding: 16,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{ fontSize: 16, fontWeight: "500", color: t.foreground }}
          onPress={onPress}
        >
          {timeFmt.format(start)} · {c.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 13, color: t.mutedForeground }}>
            {dayLongFmt.format(start)}
          </Text>
          {cancelled ? (
            <Text
              style={{
                fontSize: 12,
                textTransform: "uppercase",
                color: t.destructive,
              }}
            >
              Cancelled
            </Text>
          ) : c.bookingTier === "provisional" ? (
            <Text style={{ fontSize: 12, color: t.brandStrong }}>
              Pending approval
            </Text>
          ) : null}
        </View>
      </View>
      {action}
    </View>
  );
}

/**
 * Training tab (spec S6 "My classes" + slice B.2, ADR 39). The student's own
 * view: the next class up top, a "My Training" stats card, then Upcoming
 * (still booked) and Past (attended) lists. Booking data comes from
 * `booking.mine`; the pure `splitMyClasses` / `nextClass` divide it. Cancel
 * reuses `booking.cancel`; tapping a row opens the class detail (S5).
 */
export default function Training() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mine = useQuery(trpc.booking.mine.queryOptions());

  const cancel = useMutation(
    trpc.booking.cancel.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.booking.pathFilter());
        await queryClient.invalidateQueries(trpc.class.pathFilter());
      },
    }),
  );

  const now = new Date();
  const { upcoming, past } = splitMyClasses(mine.data ?? [], now);
  const next = nextClass(upcoming, now);
  const rest = next ? upcoming.filter((c) => c.classId !== next.classId) : upcoming;

  const openClass = (id: string) =>
    router.push({ pathname: "/class/[id]", params: { id } });

  return (
    <Screen>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <Heading>Training</Heading>
        <Mark size={26} />
      </View>

      {mine.isPending ? (
        <Loading />
      ) : mine.isError ? (
        <ErrorState label="your classes" onRetry={() => void mine.refetch()} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 24, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {next ? (
            <NextClassCard c={next} onPress={() => openClass(next.classId)} />
          ) : null}

          <MyTrainingCard />

          {upcoming.length === 0 ? (
            <View style={{ gap: 8 }}>
              <SectionLabel>Upcoming</SectionLabel>
              <EmptyState
                title="Nothing booked yet."
                body="Book a class from the schedule and it shows up here."
              />
            </View>
          ) : rest.length > 0 ? (
            <View style={{ gap: 8 }}>
              <SectionLabel>Upcoming</SectionLabel>
              {rest.map((c) => (
                <ClassRow
                  key={c.classId}
                  c={c}
                  onPress={() => openClass(c.classId)}
                  action={
                    c.status === "cancelled" ? undefined : (
                      <Button
                        label="Cancel"
                        variant="outline"
                        onPress={() => cancel.mutate({ classId: c.classId })}
                      />
                    )
                  }
                />
              ))}
            </View>
          ) : null}

          {past.length > 0 ? (
            <View style={{ gap: 8 }}>
              <SectionLabel>Past</SectionLabel>
              {past.map((c) => (
                <ClassRow
                  key={c.classId}
                  c={c}
                  onPress={() => openClass(c.classId)}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}
