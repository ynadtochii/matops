import { useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { PaymentStatus } from "@matops/domain";
import { disciplineLabel, formatRank } from "@matops/domain";

import type { ThemeMode } from "~/components/theme";
import { useThemeMode } from "~/components/theme";
import {
  Button,
  Card,
  ErrorState,
  Eyebrow,
  Field,
  Heading,
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
import {
  forgetPushToken,
  getPushToken,
  pushEnabled,
  rememberPushToken,
  setPushEnabled,
  storedPushToken,
} from "~/utils/push";

/**
 * Notification setting (spec S7) — one switch that registers or drops this
 * device's push token, so "off" means nothing is sent. No server preference.
 */
function NotificationToggle() {
  const t = useTheme();
  const [on, setOn] = useState(pushEnabled());
  const register = useMutation(trpc.pushToken.register.mutationOptions());
  const unregister = useMutation(trpc.pushToken.unregister.mutationOptions());

  const toggle = (next: boolean) => {
    setOn(next);
    void setPushEnabled(next);
    if (next) {
      void getPushToken().then((reg) => {
        if (reg) {
          register.mutate(reg, {
            onSuccess: () => void rememberPushToken(reg.token),
          });
        }
      });
    } else {
      const token = storedPushToken();
      if (token) {
        unregister.mutate({ token });
        void forgetPushToken();
      }
    }
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <View style={{ flex: 1 }}>
        <Txt size={16}>Push notifications</Txt>
        <Txt size={14} tone="muted">
          Class reminders and cancellations.
        </Txt>
      </View>
      <Switch
        value={on}
        onValueChange={toggle}
        trackColor={{ true: t.brand, false: t.input }}
        thumbColor="#ffffff"
      />
    </View>
  );
}

/** Light / Dark / System selector (mirrors the web ThemeToggle). */
function AppearanceControl() {
  const t = useTheme();
  const { mode, setMode } = useThemeMode();
  const options: { key: ThemeMode; label: string }[] = [
    { key: "dark", label: "Dark" },
    { key: "light", label: "Light" },
    { key: "auto", label: "System" },
  ];
  return (
    <View
      style={{
        flexDirection: "row",
        borderWidth: 1,
        borderColor: t.input,
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      {options.map((o) => {
        const active = mode === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => setMode(o.key)}
            style={{
              flex: 1,
              paddingVertical: 10,
              alignItems: "center",
              backgroundColor: active ? t.brandWash : "transparent",
            }}
          >
            <Txt
              size={14}
              weight={active ? 600 : 400}
              tone={active ? "brand" : "muted"}
            >
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

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

  const canSave =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    phoneValue.trim().length >= 3;

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
          disabled={!canSave || update.isPending}
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

/** A labelled value with a Copy button (the load-bearing manual-transfer step). */
function CopyRow({
  label,
  value,
  data = false,
}: {
  label: string;
  value: string;
  data?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
    // Loaded lazily + guarded: a dev client built before `expo-clipboard` was
    // added has no native module, and a top-level import would crash this route.
    void import("expo-clipboard")
      .then((Clipboard) => Clipboard.setStringAsync(value))
      .catch(() => undefined);
  };
  return (
    <View style={{ gap: 4 }}>
      <Eyebrow>{label}</Eyebrow>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        {data ? (
          <Mono size={16}>{value}</Mono>
        ) : (
          <Txt size={16} selectable style={{ flex: 1 }}>
            {value}
          </Txt>
        )}
        <Pressable onPress={copy} hitSlop={8}>
          <Txt size={14} weight={600} tone="brand">
            {copied ? "Copied ✓" : "Copy"}
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Membership dues (spec S9, ADR 40) — manual bank transfer. Shows what you owe +
 * status, the gym's requisites with a fixed reference code to copy, and an
 * "I paid" button that raises a claim the owner confirms. No card on file.
 */
function MembershipDues() {
  const dues = useQuery(trpc.payments.myDues.queryOptions());
  const claim = useMutation(
    trpc.payments.claim.mutationOptions({
      onSuccess: () => void dues.refetch(),
      onError: (err) => setError(err.message || "Could not submit"),
    }),
  );
  const [error, setError] = useState<string | null>(null);

  if (dues.isPending) return <Loading />;
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
          <CopyRow label="Bank details" value={requisites.bankDetails} />
          <CopyRow
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
            disabled={!canPay || claim.isPending || !requisites.bankDetails}
            onPress={() => {
              setError(null);
              claim.mutate({});
            }}
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

  if (ranks.isPending) return <Loading />;
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

/**
 * Profile / account (spec S7) — name, phone, current academy, switcher,
 * appearance, notifications, and sign out. The switcher appears only when the
 * student trains at 2+ gyms. This is the mobile student lens (docs/issues/18).
 */
export default function Profile() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, refetch: refetchSession } = authClient.useSession();
  const current = useQuery(trpc.academy.current.queryOptions());
  const academies = useQuery(trpc.academy.listMineStudent.queryOptions());

  const setActive = useMutation(
    trpc.academy.setActive.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  );

  const unregisterPush = useMutation(
    trpc.pushToken.unregister.mutationOptions(),
  );

  const signOut = () => {
    const token = storedPushToken();
    if (token) {
      unregisterPush.mutate({ token });
      void forgetPushToken();
    }
    void authClient.signOut();
    router.replace("/");
  };

  if (!session) {
    return <Loading />;
  }

  const user = session.user;
  const phone =
    typeof user.phone === "string" && user.phone.length > 0 ? user.phone : "";
  const list = academies.data ?? [];
  const activeId = current.data?.academyId;

  return (
    <Screen>
      <Stack gap={24}>
        <Heading>{user.name || user.email}</Heading>

        <ProfileDetails
          name={user.name || ""}
          phone={phone}
          email={user.email}
          onSaved={() =>
            refetchSession({ query: { disableCookieCache: true } })
          }
        />

        <Field label="Current academy" value={current.data?.name ?? "—"} />

        <Stack gap={8}>
          <Eyebrow>My rank</Eyebrow>
          <MyRanks />
        </Stack>

        <Stack gap={8}>
          <Eyebrow>Membership dues</Eyebrow>
          <MembershipDues />
        </Stack>

        {list.length >= 2 && (
          <Stack gap={8}>
            <Eyebrow>Switch academy</Eyebrow>
            {list.map((a) => {
              const isActive = a.academyId === activeId;
              return (
                <Pressable
                  key={a.academyId}
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

        <Stack gap={8}>
          <Eyebrow>Appearance</Eyebrow>
          <AppearanceControl />
        </Stack>

        <Stack gap={8}>
          <Eyebrow>Notifications</Eyebrow>
          <NotificationToggle />
        </Stack>

        <Button label="Sign out" variant="outline" onPress={signOut} />
      </Stack>
    </Screen>
  );
}
