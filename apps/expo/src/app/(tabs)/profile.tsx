import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { PaymentStatus } from "@matops/domain";
import { academyMapUrl, disciplineLabel, formatRank } from "@matops/domain";
import { UpdateProfileSchema } from "@matops/validators";

import { OverdueBanner } from "~/components/overdue-banner";
import { useRefreshControl } from "~/components/refresh";
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
  InlineLoading,
  Loading,
  Mono,
  Screen,
  Stack,
  StatusPill,
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

/** Money stored in minor units → "USD 50.00" (Hermes Intl is partial on native). */
function money(minor: number, currency: string): string {
  return `${currency} ${(minor / 100).toFixed(2)}`;
}

const STATUS_TONE: Record<
  PaymentStatus,
  { label: string; tone: "success" | "warning" | "error" }
> = {
  paid: { label: "Paid", tone: "success" },
  due_soon: { label: "Due soon", tone: "warning" },
  overdue: { label: "Overdue", tone: "error" },
};

/**
 * Membership dues (spec S9, ADR 40) — manual bank transfer. Shows what you owe +
 * status, the gym's requisites with a fixed reference code to copy, and an
 * "I paid" button that raises a claim the owner confirms. No card on file.
 */
function MembershipDues() {
  const [error, setError] = useState<string | null>(null);
  const dues = useQuery(trpc.payments.myDues.queryOptions());
  const claim = useMutation(
    trpc.payments.claim.mutationOptions({
      onSuccess: () => void dues.refetch(),
      onError: (err) => setError(err.message || "Could not submit"),
    }),
  );

  if (dues.isPending) return <InlineLoading />;
  if (dues.isError) {
    return <ErrorState label="your dues" onRetry={() => void dues.refetch()} />;
  }

  const { dues: d, requisites, openClaim, canPay } = dues.data;

  if (!d && !requisites.bankDetails) {
    return (
      <Txt size={14} tone="muted">
        Your gym hasn’t set up membership dues yet.
      </Txt>
    );
  }

  const meta = d ? STATUS_TONE[d.status] : null;

  return (
    <Card variant="outline" style={{ gap: 16 }}>
      {d ? (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Mono size={18} weight={600}>
              {money(d.amountMinor, d.currency)}
            </Mono>
            {meta && <StatusPill tone={meta.tone} label={meta.label} />}
          </View>
          <Txt size={14} tone="muted">
            {d.planName} · due{" "}
            <Mono size={14} tone="muted">
              {new Date(d.nextDueAt).toLocaleDateString()}
            </Mono>
          </Txt>
        </View>
      ) : null}

      {requisites.bankDetails ? (
        <View style={{ gap: 12 }}>
          <CopyField label="Bank details" value={requisites.bankDetails} />
          <CopyField
            label="Reference (add to your transfer)"
            value={requisites.reference}
            data
          />
        </View>
      ) : (
        <Txt size={14} tone="muted">
          Ask your gym for their bank details to pay.
        </Txt>
      )}

      {error ? (
        <Txt size={14} tone="error">
          {error}
        </Txt>
      ) : null}

      {d ? (
        openClaim ? (
          <Txt size={14} tone="muted">
            Payment submitted — waiting for your gym to confirm.
          </Txt>
        ) : (
          <Button
            label={claim.isPending ? "Submitting…" : "I paid"}
            loading={claim.isPending}
            disabled={!canPay || !requisites.bankDetails}
            onPress={() =>
              confirm({
                title: "Mark this as paid?",
                message:
                  "This tells your gym you sent the transfer. They'll confirm it once the money arrives.",
                confirmLabel: "I paid",
                destructive: false,
                onConfirm: () => {
                  setError(null);
                  claim.mutate({});
                },
              })
            }
          />
        )
      ) : null}
    </Card>
  );
}

/**
 * My ranks (spec S7, slice G.3 — ADR 41). Read-only: the student sees their rank
 * in each discipline plus a short promotion timeline. Only the gym sets rank.
 */
function MyRanks() {
  const t = useTheme();
  const ranks = useQuery(trpc.rank.mine.queryOptions());

  if (ranks.isPending) return <InlineLoading />;
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Settings"
      hitSlop={10}
      onPress={onPress}
    >
      <Txt size={22}>⚙️</Txt>
    </Pressable>
  );
}

function AcademyAddress({ address }: { address: string }) {
  const mapUrl = academyMapUrl(address);
  return (
    <View style={{ gap: 2 }}>
      <Txt size={14} tone="muted">
        {address}
      </Txt>
      {mapUrl ? (
        <Txt
          size={13}
          tone="brand"
          onPress={() => void Linking.openURL(mapUrl)}
        >
          Open in Maps
        </Txt>
      ) : null}
    </View>
  );
}

/**
 * Profile / account (spec S7) — identity (name/phone/email), rank, membership
 * dues, and the multi-academy switcher (2+ gyms only). Appearance, notifications,
 * and sign out moved to Settings (S12, v1.8 slice 5), reached via the header gear.
 * The overdue strip (S11) can deep-link here with `?focus=dues` to land on the
 * pay section. This is the mobile student lens (docs/issues/18).
 */
export default function Profile() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const { data: session, refetch: refetchSession } = authClient.useSession();
  const current = useQuery(trpc.academy.current.queryOptions());
  const academies = useQuery(trpc.academy.listMineStudent.queryOptions());

  const refreshControl = useRefreshControl();

  const setActive = useMutation(
    trpc.academy.setActive.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  );

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
  const list = academies.data ?? [];
  const activeId = current.data?.academyId;
  // Suspended → the enrolled rank + dues reads are rejected by the server. Hide
  // those sections behind a calm banner, but keep Profile itself (sign out /
  // switch academy stay reachable). §4.
  const suspended = current.data?.status === "suspended";
  // Dues (and the gym's bank details) are for approved members only, so the
  // server rejects the read while a join is still pending. Hide the section
  // rather than showing an error where nothing is wrong yet.
  const approved = current.data?.status === "active";

  return (
    <Screen>
      <OverdueBanner />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Heading>{user.name || user.email}</Heading>
        <SettingsButton onPress={() => router.push("/settings")} />
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

        <Field label="Current academy">
          <Txt size={16}>{current.data?.name ?? "—"}</Txt>
          {current.data?.address ? (
            <AcademyAddress address={current.data.address} />
          ) : null}
        </Field>

        {suspended ? (
          <Banner tone="warning">
            Your membership is paused. Contact your gym to restore your access.
          </Banner>
        ) : (
          <>
            <Stack gap={8}>
              <Eyebrow>My rank</Eyebrow>
              <MyRanks />
            </Stack>

            {approved && (
              <View
                style={{ gap: 8 }}
                onLayout={(e) => (duesY.current = e.nativeEvent.layout.y)}
              >
                <Eyebrow>Membership dues</Eyebrow>
                <MembershipDues />
              </View>
            )}
          </>
        )}

        {list.length >= 2 && (
          <Stack gap={8}>
            <Eyebrow>Switch academy</Eyebrow>
            {list.map((a) => {
              const isActive = a.academyId === activeId;
              return (
                <Pressable
                  key={a.academyId}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to ${a.name}`}
                  accessibilityState={{
                    selected: isActive,
                    disabled: isActive || setActive.isPending,
                  }}
                  disabled={isActive || setActive.isPending}
                  onPress={() => setActive.mutate({ academyId: a.academyId })}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderRadius: 3,
                    padding: 16,
                    backgroundColor: isActive ? t.brand : t.muted,
                  }}
                >
                  <Txt
                    size={16}
                    weight={isActive ? 500 : 400}
                    color={isActive ? t.brandForeground : t.foreground}
                  >
                    {a.name}
                  </Txt>
                  {isActive && (
                    <Txt size={16} color={t.brandForeground}>
                      ✓
                    </Txt>
                  )}
                </Pressable>
              );
            })}
          </Stack>
        )}
      </ScrollView>
    </Screen>
  );
}
