import { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  academyMapUrl,
  disciplineLabel,
  formatMoney,
  formatRank,
  isBjjAcademy,
} from "@matops/domain";
import { UpdateProfileSchema } from "@matops/validators";

import { AppHeader } from "~/components/app-header";
import { SettingsIcon } from "~/components/icons";
import { OverdueBanner } from "~/components/overdue-banner";
import { useRefreshControl } from "~/components/refresh";
import { RankSkeleton } from "~/components/skeletons";
import {
  Banner,
  Button,
  Card,
  confirm,
  CopyField,
  ErrorState,
  Eyebrow,
  Field,
  Heading,
  Loading,
  Mono,
  Muted,
  Screen,
  Stack,
  TextField,
  Txt,
  useTheme,
} from "~/components/ui";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";

/**
 * Editable personal details (spec S7, slice B.3). Name + phone are editable;
 * email stays read-only. After a save the Better Auth session is refetched with
 * `disableCookieCache` so the new values show at once.
 */
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
        onSaved();
      },
      onError: (err) => setError(err.message || "Could not save"),
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

  // The same rules the server enforces, so Save and the API agree.
  const canSave = UpdateProfileSchema.safeParse({
    firstName,
    lastName,
    phone: phoneValue,
  }).success;

  if (!editing) {
    return (
      <Stack gap={20}>
        <Field label="Name" value={name || "—"} />
        <Field label="Phone" value={phone || "—"} data />
        <Field label="Email" value={email} />
        <Button label="Edit profile" variant="outline" onPress={startEdit} />
      </Stack>
    );
  }

  return (
    <Stack gap={16}>
      <TextField
        label="First name"
        value={firstName}
        onChangeText={setFirstName}
        autoCapitalize="words"
        autoFocus
      />
      <TextField
        label="Last name"
        value={lastName}
        onChangeText={setLastName}
        autoCapitalize="words"
      />
      <TextField
        label="Phone"
        value={phoneValue}
        onChangeText={setPhoneValue}
        keyboardType="phone-pad"
      />
      <Field label="Email" value={email} />
      {error ? (
        <Txt size={14} tone="error">
          {error}
        </Txt>
      ) : null}
      <Stack row gap={8}>
        <Button
          label={update.isPending ? "Saving…" : "Save"}
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
          onPress={() => setEditing(false)}
        />
      </Stack>
    </Stack>
  );
}

/**
 * Membership dues (spec S9, ADR 40) — manual bank transfer. Shows what you owe +
 * status, the gym's requisites with a fixed reference code to copy, and an
 * "I paid" button that raises a claim the owner confirms. No card on file.
 */
/**
 * What the person owes on their shared memberships, and by when (ADR 126).
 *
 * Silent when every month is settled. The wording is `membershipWarning` from
 * the domain, the same sentence the web shows, so the two clients cannot drift
 * about the same situation. One notice per membership, never one per covered
 * branch.
 */
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
          <Banner tone={m.warning?.verdict === "blocked" ? "info" : "warning"}>
            <Txt size={14} style={{ color: t.foreground }}>
              {m.warning?.headline}
            </Txt>
            <Txt size={13} tone="muted">
              {m.warning?.detail}
            </Txt>
            {m.amount ? (
              <Txt size={14} style={{ color: t.foreground }}>
                {formatMoney(m.amount.priceMinor, m.amount.currency)}
              </Txt>
            ) : null}
          </Banner>
          {bankDetails ? (
            <Stack gap={12}>
              <CopyField label="Bank details" value={bankDetails} />
              <CopyField
                label="Reference (add to your transfer)"
                value={m.reference}
                data
              />
              {m.claimedAt ? (
                <Txt size={13} tone="muted">
                  Payment submitted — waiting for your gym to confirm.
                </Txt>
              ) : (
                <Button
                  label={claim.isPending ? "Submitting…" : "I paid"}
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
            <Txt size={13} tone="muted">
              Ask your gym for their bank details to pay.
            </Txt>
          )}
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * The plan waiting for the 1st (ADR 129), in the same words the web uses.
 * Not a warning: this month is unaffected and there is nothing to pay early.
 */
function MembershipChangeNotice() {
  const standing = useQuery(trpc.accessPlan.mine.queryOptions());
  const changing = (standing.data?.memberships ?? []).filter((m) => m.next);
  if (changing.length === 0) return null;

  return (
    <Stack gap={8}>
      {changing.map((m) => (
        <Card key={m.assignmentId} variant="outline" style={{ gap: 4 }}>
          <Eyebrow>Your plan changes</Eyebrow>
          <Txt size={13} tone="muted">
            {m.planName} runs to the end of this month. {m.next?.planName}{" "}
            starts on 1 {m.next?.effectiveMonthLabel}
            {m.next?.amount
              ? ` at ${formatMoney(m.next.amount.priceMinor, m.next.amount.currency)} a month`
              : ""}
            .
          </Txt>
        </Card>
      ))}
    </Stack>
  );
}

/**
 * My ranks (spec S7, slice G.3 — ADR 41). Read-only: the student sees their rank
 * in each discipline plus a short promotion timeline. Only the gym sets rank.
 */
function MyRanks() {
  const t = useTheme();
  const ranks = useQuery(trpc.rank.mine.queryOptions());

  if (ranks.isPending) return <RankSkeleton />;
  if (ranks.isError) {
    return (
      <ErrorState label="your ranks" onRetry={() => void ranks.refetch()} />
    );
  }

  const { ranks: list, history } = ranks.data;
  if (list.length === 0) {
    return (
      <Txt size={14} tone="muted">
        Your gym hasn’t set your rank yet.
      </Txt>
    );
  }

  return (
    <Card variant="outline" style={{ gap: 12 }}>
      {list.map((r) => (
        <View
          key={r.discipline}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Txt size={14} tone="muted">
            {disciplineLabel(r.discipline)}
          </Txt>
          <Txt size={16} weight={600}>
            {formatRank(r)}
          </Txt>
        </View>
      ))}
      {history.length > 0 && (
        <View
          style={{
            gap: 6,
            borderTopWidth: 1,
            borderStyle: "dashed",
            borderTopColor: t.border,
            paddingTop: 12,
          }}
        >
          <Eyebrow>Promotions</Eyebrow>
          {history.slice(0, 5).map((h) => (
            <View
              key={h.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <Txt size={14}>
                {disciplineLabel(h.discipline)} ·{" "}
                {formatRank({
                  discipline: h.discipline,
                  belt: h.toBelt,
                  stripes: h.toStripes,
                })}
              </Txt>
              <Mono size={13} tone="muted">
                {new Date(h.promotedAt).toLocaleDateString()}
              </Mono>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

/** Gear glyph for the header — opens Settings (S12). Emoji renders from the
 * system font, independent of Geist, so no icon-font dependency is added. */
function SettingsButton({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Settings"
      hitSlop={10}
      onPress={onPress}
    >
      <SettingsIcon color={t.mutedForeground} size={20} />
    </Pressable>
  );
}

function AcademyAddress({
  address,
  pinned,
}: {
  address: string;
  pinned: string | null;
}) {
  const webUrl = academyMapUrl(address, pinned);
  const mapUrl =
    pinned || !webUrl
      ? webUrl
      : Platform.select({
          ios: `maps://?q=${encodeURIComponent(address)}`,
          android: `geo:0,0?q=${encodeURIComponent(address)}`,
          default: webUrl,
        });
  return (
    <View style={{ gap: 2 }}>
      <Txt size={14} tone="muted">
        {address}
      </Txt>
      {mapUrl ? (
        <Txt
          size={13}
          tone="brand"
          onPress={() => {
            void Linking.openURL(mapUrl).catch(
              () => void Linking.openURL(webUrl ?? mapUrl),
            );
          }}
        >
          Open in Maps
        </Txt>
      ) : null}
    </View>
  );
}

/**
 * Profile / account (spec S7) — identity (name/phone/email), rank, membership
 * dues, and joining another branch. Switching between branches is the branch
 * name in the header (ADR 129). Appearance, notifications,
 * and sign out moved to Settings (S12, v1.8 slice 5), reached via the header gear.
 * The overdue strip (S11) can deep-link here with `?focus=dues` to land on the
 * pay section. This is the mobile student lens (docs/issues/18).
 */
export default function Profile() {
  const router = useRouter();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const { data: session, refetch: refetchSession } = authClient.useSession();
  const current = useQuery(trpc.academy.current.queryOptions());

  const refreshControl = useRefreshControl();

  // Best-effort scroll to the dues section when arriving from the overdue strip.
  const scrollRef = useRef<ScrollView>(null);
  const duesY = useRef<number | null>(null);
  useEffect(() => {
    if (focus === "dues" && duesY.current != null) {
      scrollRef.current?.scrollTo({ y: duesY.current, animated: true });
    }
  }, [focus, session]);

  if (!session) {
    return <Loading />;
  }

  const user = session.user;
  const phone =
    typeof user.phone === "string" && user.phone.length > 0 ? user.phone : "";
  // Suspended → the enrolled rank + dues reads are rejected by the server. Hide
  // those sections behind a calm banner, but keep Profile itself (sign out /
  // switch academy stay reachable). §4.
  const suspended = current.data?.status === "suspended";
  // Dues (and the gym's bank details) are for approved members only, so the
  // server rejects the read while a join is still pending. Hide the section
  // rather than showing an error where nothing is wrong yet.
  const approved = current.data?.status === "active";
  // Belts belong to a mat. A general branch has no rank, and `rank.mine` is
  // refused there by the server, so the section goes rather than erroring.
  const bjj = isBjjAcademy(current.data?.type ?? "");
  // Which gate this branch runs on, so no screen offers a setting the server
  // stopped reading (ADR 126, ADR 127).

  return (
    <Screen
      header={
        <AppHeader
          right={<SettingsButton onPress={() => router.push("/settings")} />}
        />
      }
    >
      <OverdueBanner />

      <View style={{ marginBottom: 16 }}>
        <Heading>{user.name || user.email}</Heading>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        <ProfileDetails
          name={user.name || ""}
          phone={phone}
          email={user.email}
          onSaved={() =>
            refetchSession({ query: { disableCookieCache: true } })
          }
        />

        <Field label="Current branch">
          <Txt size={16}>{current.data?.name ?? "—"}</Txt>
          {current.data?.address ? (
            <AcademyAddress
              address={current.data.address}
              pinned={current.data.mapUrl}
            />
          ) : null}
        </Field>

        {suspended ? (
          <Banner tone="warning">
            Your membership is paused. Contact your gym to restore your access.
          </Banner>
        ) : (
          <>
            {bjj && (
              <Stack gap={8}>
                <Eyebrow>My rank</Eyebrow>
                <MyRanks />
              </Stack>
            )}

            {approved && (
              <View
                style={{ gap: 8 }}
                onLayout={(e) => (duesY.current = e.nativeEvent.layout.y)}
              >
                <Eyebrow>Membership</Eyebrow>
                <MembershipNotice />
                <MembershipChangeNotice />
              </View>
            )}
          </>
        )}

        <Stack gap={8}>
          <Eyebrow>Another branch</Eyebrow>
          <Muted>
            Train somewhere else too? Ask them for their 6-digit ID and join it
            here. Switching between the places you already train at is the
            branch name at the top of the screen.
          </Muted>
          <Button
            label="Join another branch"
            variant="outline"
            onPress={() => router.push("/onboarding?another=1")}
          />
        </Stack>
      </ScrollView>
    </Screen>
  );
}
