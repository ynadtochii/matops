import { useEffect, useRef, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, SlidersHorizontal } from "lucide-react-native";

import {
  academyMapUrl,
  CONTACT_EMAIL,
  dateYearFmt,
  disciplineLabel,
  feedbackMailto,
  formatMoney,
  formatRank,
  monthYearFmt,
} from "@matops/domain";
import { UpdateProfileSchema } from "@matops/validators";

import { AppHeader } from "~/components/app-header";
import { OverdueBanner } from "~/components/overdue-banner";
import { ProfilePicture } from "~/components/profile-picture";
import { useRefreshControl } from "~/components/refresh";
import { RankSkeleton } from "~/components/skeletons";
import { useToast } from "~/components/toast";
import {
  Button,
  Callout,
  Card,
  confirm,
  CopyField,
  EmptyState,
  ErrorState,
  Eyebrow,
  Heading,
  IconButton,
  List,
  Loading,
  Muted,
  Screen,
  SectionHeading,
  SettingsRow,
  Stack,
  TextField,
  Txt,
  useTheme,
} from "~/components/ui";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";
import { getBaseUrl } from "~/utils/base-url";

function ProfileDetails({
  name,
  phone,
  email,
  onSaved,
}: {
  name: string;
  phone: string;
  email: string;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneValue, setPhoneValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const update = useMutation(
    trpc.account.updateProfile.mutationOptions({
      onSuccess: () => {
        setEditing(false);
        setError(null);
        toast.show("Profile saved");
        onSaved();
      },
      onError: (err) => setError(err.message || "Couldn't save. Try again."),
    }),
  );

  const startEdit = () => {
    const parts = name.trim().split(/\s+/);
    setFirstName(parts[0] ?? "");
    setLastName(parts.slice(1).join(" "));
    setPhoneValue(phone);
    setError(null);
    setEditing(true);
  };

  const canSave = UpdateProfileSchema.safeParse({
    firstName,
    lastName,
    phone: phoneValue,
  }).success;

  if (!editing) {
    return (
      <List>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: 16,
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Eyebrow>Name</Eyebrow>
            <Txt size={15} weight={500}>
              {name || "Not provided"}
            </Txt>
          </View>
          <Button label="Edit details" variant="outline" onPress={startEdit} />
        </View>
        <View style={{ gap: 4, padding: 16 }}>
          <Eyebrow>Phone</Eyebrow>
          <Txt size={15}>{phone || "Not provided"}</Txt>
        </View>
        <View style={{ gap: 4, padding: 16 }}>
          <Eyebrow>Email</Eyebrow>
          <Txt size={15}>{email}</Txt>
          <Muted>This is your sign-in, so it cannot be changed here.</Muted>
        </View>
      </List>
    );
  }

  return (
    <Card style={{ gap: 16 }}>
      <TextField
        label="First name"
        value={firstName}
        onChangeText={setFirstName}
        autoCapitalize="words"
        textContentType="givenName"
        autoFocus
      />
      <TextField
        label="Last name"
        value={lastName}
        onChangeText={setLastName}
        autoCapitalize="words"
        textContentType="familyName"
      />
      <TextField
        label="Phone"
        value={phoneValue}
        onChangeText={setPhoneValue}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
      />
      {error ? (
        <Txt size={13} tone="error">
          {error}
        </Txt>
      ) : null}
      <Stack row gap={8}>
        <Button
          label="Save changes"
          loading={update.isPending}
          disabled={!canSave}
          onPress={() =>
            update.mutate({
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              phone: phoneValue.trim(),
            })
          }
        />
        <Button
          label="Cancel"
          variant="ghost"
          disabled={update.isPending}
          onPress={() => setEditing(false)}
        />
      </Stack>
    </Card>
  );
}

function MembershipNotice() {
  const t = useTheme();
  const standing = useQuery(trpc.accessPlan.mine.queryOptions());
  const claim = useMutation(
    trpc.accessPlan.claimMonth.mutationOptions({
      onSuccess: () => void standing.refetch(),
    }),
  );
  const warned = (standing.data?.memberships ?? []).filter((m) => m.warning);
  const bankDetails = standing.data?.bankDetails ?? "";
  if (warned.length === 0) return null;

  return (
    <Stack gap={16}>
      {warned.map((m) => (
        <Stack key={m.assignmentId} gap={8}>
          <Callout
            tone={m.warning?.verdict === "blocked" ? "error" : "warning"}
            title={m.warning?.headline}
          >
            <Txt size={13} tone="secondary">
              {m.warning?.detail}
            </Txt>
            {m.amount ? (
              <Txt size={15} tabular style={{ color: t.foreground }}>
                {formatMoney(m.amount.priceMinor, m.amount.currency)}
              </Txt>
            ) : null}
          </Callout>
          {bankDetails ? (
            <Stack gap={12}>
              <CopyField label="Bank details" value={bankDetails} />
              <CopyField
                label="Reference (add to your transfer)"
                value={m.reference}
                data
              />
              {m.reportedAt ? (
                <Muted>
                  Payment submitted. Waiting for your gym to confirm.
                </Muted>
              ) : (
                <Button
                  label="I paid"
                  loading={claim.isPending}
                  onPress={() =>
                    confirm({
                      title: "Mark this as paid?",
                      message:
                        "This tells your gym you sent the transfer. They'll confirm it once the money arrives.",
                      confirmLabel: "I paid",
                      destructive: false,
                      onConfirm: () =>
                        claim.mutate({ assignmentId: m.assignmentId }),
                    })
                  }
                />
              )}
            </Stack>
          ) : (
            <Muted>Ask your gym for their bank details to pay.</Muted>
          )}
        </Stack>
      ))}
    </Stack>
  );
}

function MembershipChangeNotice() {
  const standing = useQuery(trpc.accessPlan.mine.queryOptions());
  const changing = (standing.data?.memberships ?? []).filter((m) => m.next);
  if (changing.length === 0) return null;

  return (
    <Stack gap={8}>
      {changing.map((m) => (
        <Card key={m.assignmentId} style={{ gap: 4 }}>
          <Eyebrow>Your plan changes</Eyebrow>
          <Muted>
            {`${m.planName} runs to the end of this month. ${m.next?.planName} starts on 1 ${m.next?.effectiveMonthLabel}${
              m.next?.amount
                ? ` at ${formatMoney(m.next.amount.priceMinor, m.next.amount.currency)} a month`
                : ""
            }.`}
          </Muted>
        </Card>
      ))}
    </Stack>
  );
}

function MyRank() {
  const t = useTheme();
  const ranks = useQuery(trpc.rank.mine.queryOptions());
  const [showHistory, setShowHistory] = useState(false);

  if (ranks.isPending) return <RankSkeleton />;
  if (ranks.isError) {
    return (
      <ErrorState label="your rank" onRetry={() => void ranks.refetch()} />
    );
  }

  const { ranks: list, history } = ranks.data;
  if (list.length === 0) {
    return (
      <EmptyState
        title="Your gym hasn't set your rank yet."
        body="Only a coach can set it."
      />
    );
  }

  return (
    <List>
      {list.map((r) => (
        <View
          key={r.discipline}
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Txt size={13} tone="muted">
            {disciplineLabel(r.discipline)}
          </Txt>
          <Txt size={15} weight={500}>
            {formatRank(r)}
          </Txt>
        </View>
      ))}
      {history.length > 0 ? (
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showHistory }}
            onPress={() => setShowHistory((v) => !v)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              minHeight: 44,
              paddingHorizontal: 16,
              backgroundColor: pressed ? t.hover : "transparent",
            })}
          >
            <Txt size={13} weight={500} tone="secondary">
              {`Promotion history (${history.length})`}
            </Txt>
            <ChevronDown
              size={16}
              color={t.mutedForeground}
              style={{
                transform: [{ rotate: showHistory ? "180deg" : "0deg" }],
              }}
            />
          </Pressable>
          {showHistory ? (
            <View style={{ gap: 12, paddingHorizontal: 16, paddingBottom: 16 }}>
              {history.map((h) => (
                <View
                  key={h.id}
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <Txt size={13}>
                    {`${disciplineLabel(h.discipline)} · ${formatRank({
                      discipline: h.discipline,
                      belt: h.toBelt,
                      stripes: h.toStripes,
                    })}`}
                  </Txt>
                  <Txt size={12} tone="muted" tabular>
                    {dateYearFmt.format(new Date(h.promotedAt))}
                  </Txt>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </List>
  );
}

function EmailUpdates({ academyName }: { academyName: string }) {
  const t = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const current = useQuery(trpc.membership.emailUpdates.queryOptions());
  const save = useMutation(
    trpc.membership.setEmailUpdates.mutationOptions({
      onSuccess: async (_, input) => {
        await queryClient.invalidateQueries(
          trpc.membership.emailUpdates.pathFilter(),
        );
        toast.show(input.emailUpdates ? "Emails on" : "Emails off");
      },
      onError: (err) => toast.show(err.message || "Couldn't save. Try again."),
    }),
  );

  if (current.isPending) return <RankSkeleton />;
  if (current.isError) {
    return (
      <ErrorState
        label="your email choice"
        onRetry={() => void current.refetch()}
      />
    );
  }

  return (
    <List>
      <SettingsRow
        title={`Keep me updated on changes at ${academyName}`}
        description="Emails about your membership and your booked classes always arrive."
      >
        <Switch
          accessibilityLabel={`Keep me updated on changes at ${academyName}`}
          value={current.data.optedInAt !== null}
          disabled={save.isPending}
          onValueChange={(on) => save.mutate({ emailUpdates: on })}
          trackColor={{ true: t.primary, false: t.track }}
          thumbColor="#ffffff"
        />
      </SettingsRow>
    </List>
  );
}

function EraseRequest({ academyName }: { academyName: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const request = useQuery(trpc.membership.erasureRequest.queryOptions());
  const refresh = () =>
    queryClient.invalidateQueries(trpc.membership.erasureRequest.pathFilter());
  const onError = (err: { message: string }) =>
    toast.show(err.message || "Couldn't send that. Try again.");
  const ask = useMutation(
    trpc.membership.requestErasure.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.show(`Request sent to ${academyName}`);
      },
      onError,
    }),
  );
  const withdraw = useMutation(
    trpc.membership.withdrawErasureRequest.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.show("Request withdrawn");
      },
      onError,
    }),
  );

  if (request.isPending) return <RankSkeleton />;
  if (request.isError) {
    return (
      <ErrorState
        label="your erase request"
        onRetry={() => void request.refetch()}
      />
    );
  }

  const { requestedAt } = request.data;
  const busy = ask.isPending || withdraw.isPending;
  const what =
    "your bookings, attendance, rank and notes. Your sign-in goes too, unless you belong to another gym.";

  return (
    <List>
      {requestedAt ? (
        <View style={{ gap: 12, padding: 16 }}>
          <Txt size={15} weight={500}>
            Erase request sent
          </Txt>
          <Muted>
            {`You asked on ${dateYearFmt.format(new Date(requestedAt))}. The owner or a manager will erase ${what}`}
          </Muted>
          <Button
            label="Withdraw request"
            variant="outline"
            loading={withdraw.isPending}
            disabled={busy}
            onPress={() => withdraw.mutate()}
          />
        </View>
      ) : (
        <View style={{ gap: 12, padding: 16 }}>
          <Txt size={15} weight={500}>
            Erase my data
          </Txt>
          <Muted>{`Ask ${academyName} to erase ${what}`}</Muted>
          <Button
            label="Ask to erase"
            variant="outline"
            loading={ask.isPending}
            disabled={busy}
            onPress={() => ask.mutate()}
          />
        </View>
      )}
    </List>
  );
}

function AcademyAddress({
  address,
  pinned,
}: {
  address: string | null;
  pinned: string | null;
}) {
  const webUrl = academyMapUrl(address, pinned);
  const mapUrl =
    pinned || !webUrl || !address
      ? webUrl
      : Platform.select({
          ios: `maps://?q=${encodeURIComponent(address)}`,
          android: `geo:0,0?q=${encodeURIComponent(address)}`,
          default: webUrl,
        });
  if (!address && !mapUrl) return null;
  return (
    <View style={{ gap: 2 }}>
      {address ? <Muted>{address}</Muted> : null}
      {mapUrl ? (
        <FooterLink
          label="Open in maps"
          onPress={() =>
            void Linking.openURL(mapUrl).catch(
              () => void Linking.openURL(webUrl ?? mapUrl),
            )
          }
        />
      ) : null}
    </View>
  );
}

function FooterLink({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={{ minHeight: 44, justifyContent: "center" }}
    >
      <Txt size={13} tone="muted" style={{ textDecorationLine: "underline" }}>
        {label}
      </Txt>
    </Pressable>
  );
}

export default function Profile() {
  const t = useTheme();
  const router = useRouter();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const { data: session, refetch: refetchSession } = authClient.useSession();
  const current = useQuery(trpc.academy.current.queryOptions());
  const refreshControl = useRefreshControl();
  const toast = useToast();

  const scrollRef = useRef<ScrollView>(null);
  const duesY = useRef<number | null>(null);
  useEffect(() => {
    if (focus === "dues" && duesY.current != null) {
      scrollRef.current?.scrollTo({ y: duesY.current, animated: true });
    }
  }, [focus, session]);

  if (!session) return <Loading />;

  const user = session.user;
  const phone =
    typeof user.phone === "string" && user.phone.length > 0 ? user.phone : "";
  const academy = current.data;
  const suspended = academy?.status === "suspended";
  const showDues =
    academy?.status === "active" && academy.membershipEnforced === true;

  return (
    <Screen
      header={
        <AppHeader
          right={
            <IconButton
              label="Settings"
              onPress={() => router.push("/settings")}
            >
              <SlidersHorizontal size={20} color={t.mutedForeground} />
            </IconButton>
          }
        />
      }
      style={{ paddingBottom: 0 }}
    >
      <OverdueBanner />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 32, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        <View style={{ gap: 4 }}>
          <Heading>Profile</Heading>
          <Muted>Manage your account and view your training details.</Muted>
        </View>

        <ProfilePicture name={user.name || ""} email={user.email} />

        <Stack gap={16}>
          <SectionHeading>Account details</SectionHeading>
          <ProfileDetails
            name={user.name || ""}
            phone={phone}
            email={user.email}
            onSaved={() =>
              refetchSession({ query: { disableCookieCache: true } })
            }
          />
        </Stack>

        {academy ? (
          <Stack gap={16}>
            <SectionHeading>Your training</SectionHeading>
            <Card style={{ gap: 12 }}>
              <View style={{ gap: 4 }}>
                <Txt size={17} weight={600}>
                  {academy.name}
                </Txt>
                <Muted>
                  {academy.status === "pending"
                    ? "Awaiting approval"
                    : suspended
                      ? "Membership suspended"
                      : academy.role.charAt(0).toUpperCase() +
                        academy.role.slice(1)}
                </Muted>
                <Muted>
                  {`Joined ${monthYearFmt.format(new Date(academy.joinedAt))}`}
                </Muted>
              </View>
              {academy.address || academy.mapUrl ? (
                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: t.border,
                    paddingTop: 12,
                  }}
                >
                  <AcademyAddress
                    address={academy.address}
                    pinned={academy.mapUrl}
                  />
                </View>
              ) : null}
            </Card>
          </Stack>
        ) : null}

        {showDues ? (
          <View
            style={{ gap: 16 }}
            onLayout={(e) => (duesY.current = e.nativeEvent.layout.y)}
          >
            <SectionHeading>Membership</SectionHeading>
            <MembershipNotice />
            <MembershipChangeNotice />
          </View>
        ) : null}

        {academy ? (
          <Stack gap={16}>
            <SectionHeading>Your rank</SectionHeading>
            {suspended ? (
              <Callout tone="warning">
                Your membership is paused. Contact your gym to restore your
                access.
              </Callout>
            ) : (
              <MyRank />
            )}
          </Stack>
        ) : null}

        {academy && !suspended ? (
          <Stack gap={16}>
            <SectionHeading>Emails</SectionHeading>
            <EmailUpdates academyName={academy.name} />
          </Stack>
        ) : null}

        {academy ? (
          <Stack gap={16}>
            <SectionHeading>Your data</SectionHeading>
            {suspended ? (
              <Muted>{`To have your data erased, ask ${academy.name} directly.`}</Muted>
            ) : (
              <EraseRequest academyName={academy.name} />
            )}
          </Stack>
        ) : null}

        <Stack gap={16}>
          <SectionHeading>Another gym</SectionHeading>
          <Muted>
            Train somewhere else too? Ask them for their 6-digit join code and
            join here.
          </Muted>
          <Button
            label="Join another gym"
            variant="outline"
            onPress={() => router.push("/onboarding?another=1")}
          />
        </Stack>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            columnGap: 20,
            borderTopWidth: 1,
            borderTopColor: t.border,
            paddingTop: 12,
          }}
        >
          <FooterLink
            label="Something broken? Tell us"
            onPress={() =>
              void Linking.openURL(
                feedbackMailto({
                  academy: academy ?? null,
                  screen: "app/profile",
                }),
              ).catch(() =>
                toast.show(
                  `Couldn't open your email app. Write to ${CONTACT_EMAIL}.`,
                ),
              )
            }
          />
          <FooterLink
            label="Privacy"
            onPress={() =>
              void WebBrowser.openBrowserAsync(`${getBaseUrl()}/privacy`)
            }
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
