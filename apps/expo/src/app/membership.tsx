import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Stack as RouterStack } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { fetch } from "expo/fetch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";

import type { RouterOutputs } from "@matops/api";
import type { Money } from "@matops/domain";
import {
  FILE_RULES,
  fitWithin,
  formatMoney,
  formatMonth,
  monthsFrom,
  paymentMethodUsesReference,
  upfrontHint,
  upfrontTotal,
} from "@matops/domain";

import { useToast } from "~/components/toast";
import {
  Button,
  Callout,
  Card,
  CopyField,
  EmptyState,
  ErrorState,
  Eyebrow,
  Heading,
  Loading,
  Muted,
  Screen,
  Stack,
  TextField,
  Txt,
  useTheme,
} from "~/components/ui";
import { trpc } from "~/utils/api";

type Mine = RouterOutputs["accessPlan"]["mine"];
type Membership = Mine["memberships"][number];
type Options = RouterOutputs["studentPlan"]["options"];
type Method = Options["methods"][number];

const FALLBACK = "Couldn't send that. Try again.";
const CASH_DAYS_SHOWN = 31;

function recentDays(todayISO: string): { key: string; label: string }[] {
  const today = new Date(`${todayISO}T12:00:00Z`);
  const label = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return Array.from({ length: CASH_DAYS_SHOWN }, (_, i) => {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - i);
    return {
      key: day.toISOString().slice(0, 10),
      label: i === 0 ? "Today" : i === 1 ? "Yesterday" : label.format(day),
    };
  });
}

function errorText(err: unknown) {
  return err instanceof TRPCClientError && err.message ? err.message : FALLBACK;
}

async function pickProofJpeg(): Promise<Uint8Array | null> {
  // Imported on demand so a dev client built before these modules were added
  // still opens this screen.
  const [picker, manipulator, fs] = await Promise.all([
    import("expo-image-picker"),
    import("expo-image-manipulator"),
    import("expo-file-system"),
  ]);
  const result = await picker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const size = fitWithin(
    asset.width,
    asset.height,
    FILE_RULES.payment_receipt.maxImageEdge,
  );
  const image = await manipulator.ImageManipulator.manipulate(asset.uri)
    .resize(size)
    .renderAsync();
  const saved = await image.saveAsync({
    format: manipulator.SaveFormat.JPEG,
    compress: 0.8,
  });
  return new fs.File(saved.uri).bytes();
}

interface PayChoice {
  months: number;
  amount: Money | null;
}

function claimed(pay: PayChoice) {
  return {
    months: pay.months,
    ...(pay.amount
      ? { priceMinor: pay.amount.priceMinor, currency: pay.amount.currency }
      : {}),
  };
}

function useClaim() {
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.accessPlan.claimMonth.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.accessPlan.pathFilter());
        toast.show("Sent. Your gym will confirm it.");
      },
      onError: (err) => toast.show(errorText(err)),
    }),
  );
}

export default function MembershipScreen() {
  const mine = useQuery(trpc.accessPlan.mine.queryOptions());
  const options = useQuery(trpc.studentPlan.options.queryOptions());
  const [picking, setPicking] = useState(false);
  const [extending, setExtending] = useState(false);
  const refreshing = mine.isRefetching || options.isRefetching;
  const refresh = () => {
    void mine.refetch();
    void options.refetch();
  };

  let body;
  if (mine.isPending || options.isPending) {
    body = <Loading label="Loading your membership" />;
  } else if (mine.isError || options.isError) {
    body = <ErrorState label="your membership" onRetry={refresh} />;
  } else {
    const banner = mine.data.banner;
    const payingFor =
      banner?.kind === "finish_payment" ||
      banner?.kind === "renew_due" ||
      banner?.kind === "renew_overdue"
        ? mine.data.memberships.find(
            (m) => m.assignmentId === banner.assignmentId,
          )
        : undefined;
    const renewal =
      banner?.kind === "renew_due" || banner?.kind === "renew_overdue";

    const settled = mine.data.memberships.find(
      (m) => m.status === "active" && m.paymentRequired && m.upfront,
    );
    if (!banner && settled && extending) {
      body = (
        <PayStep
          membership={settled}
          options={options.data}
          extend
          onCancel={() => setExtending(false)}
          onReturn={refresh}
        />
      );
    } else if (!banner) {
      body = (
        <Stack gap={16}>
          <EmptyState
            title="Nothing to pay right now."
            body={
              settled?.paidUntilLabel
                ? `Paid through ${settled.paidUntilLabel}.`
                : "Your membership is up to date."
            }
          />
          {settled ? (
            <Button
              label="Pay ahead"
              variant="outline"
              onPress={() => setExtending(true)}
            />
          ) : null}
        </Stack>
      );
    } else if (banner.kind === "no_plans") {
      body = (
        <EmptyState
          title="Your gym has not set up memberships yet."
          body="Booking opens once you are on a plan. Ask your gym."
        />
      );
    } else if (
      banner.kind === "waiting_check" ||
      banner.kind === "waiting_cash" ||
      banner.kind === "rejected" ||
      banner.kind === "paused"
    ) {
      body = (
        <Callout
          tone={banner.kind === "waiting_check" ? "warning" : "error"}
          title={mine.data.bannerText?.text}
        />
      );
    } else if (payingFor && (renewal || !picking)) {
      body = (
        <PayStep
          membership={payingFor}
          options={options.data}
          onChangePlan={renewal ? undefined : () => setPicking(true)}
          onReturn={refresh}
        />
      );
    } else {
      body = (
        <PlanPicker
          plans={options.data.plans}
          current={payingFor?.planName ?? null}
          onDone={() => setPicking(false)}
        />
      );
    }
  }

  return (
    <Screen avoidKeyboard>
      <RouterStack.Screen options={{ title: "Membership" }} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        {body}
      </ScrollView>
    </Screen>
  );
}

function PlanPicker({
  plans,
  current,
  onDone,
}: {
  plans: Options["plans"];
  current: string | null;
  onDone: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const choose = useMutation(
    trpc.studentPlan.choose.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.accessPlan.pathFilter());
        onDone();
      },
      onError: (err) => toast.show(errorText(err)),
    }),
  );

  return (
    <Stack gap={16}>
      <Stack gap={4}>
        <Eyebrow>Step 1 of 2</Eyebrow>
        <Heading>Choose a membership</Heading>
      </Stack>
      {plans.length === 0 ? (
        <EmptyState
          title="No plans are open right now."
          body="Ask your gym which plan to take."
        />
      ) : (
        plans.map((plan) => (
          <Card key={plan.id} style={{ gap: 10 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Txt size={17} weight={600} style={{ flex: 1 }}>
                {plan.name}
              </Txt>
              {plan.amount ? (
                <Txt size={17} tabular>
                  {`${formatMoney(plan.amount.priceMinor, plan.amount.currency)} a month`}
                </Txt>
              ) : null}
            </View>
            {plan.description ? <Muted>{plan.description}</Muted> : null}
            <Button
              label={plan.name === current ? "Keep this plan" : "Choose"}
              variant={plan.name === current ? "outline" : "primary"}
              loading={choose.isPending && choose.variables.planId === plan.id}
              disabled={choose.isPending}
              onPress={() => choose.mutate({ planId: plan.id })}
            />
          </Card>
        ))
      )}
      {current ? (
        <Button label="Back to payment" variant="ghost" onPress={onDone} />
      ) : null}
    </Stack>
  );
}

function PayStep({
  membership,
  options,
  onChangePlan,
  onReturn,
  extend = false,
  onCancel,
}: {
  membership: Membership;
  options: Options;
  onChangePlan?: () => void;
  onReturn: () => void;
  extend?: boolean;
  onCancel?: () => void;
}) {
  const t = useTheme();
  const upfront = membership.upfront;
  const [months, setMonths] = useState(1);
  const quote = upfront
    ? upfrontTotal(upfront.monthlyMinor, upfront.rule, months)
    : null;
  const hint = upfront
    ? upfrontHint(upfront.monthlyMinor, upfront.rule, months)
    : null;
  const firstMonth = upfront?.firstMonth ?? membership.month;
  const ahead = months > 1 || firstMonth !== membership.month;
  const amount: Money | null =
    upfront && quote
      ? { priceMinor: quote.totalMinor, currency: upfront.currency }
      : membership.amount;
  const pay = { months, amount };
  const methods = options.methods.filter(
    (m) => !m.offPlanIds.includes(membership.planId),
  );
  const choices = [
    ...(membership.cardPaymentUrl && !ahead
      ? [{ id: "card", label: "Card" }]
      : []),
    ...methods.map((m) => ({ id: m.id, label: m.label })),
  ];
  const [choice, setChoice] = useState<string | null>(
    choices.length === 1 ? (choices[0]?.id ?? null) : null,
  );
  const method = methods.find((m) => m.id === choice);
  const lastMonth = monthsFrom(firstMonth, months).at(-1) ?? firstMonth;

  return (
    <Stack gap={16}>
      <Stack gap={4}>
        {onChangePlan ? <Eyebrow>Step 2 of 2</Eyebrow> : null}
        {extend ? <Eyebrow>Pay ahead</Eyebrow> : null}
        <Heading>
          {extend
            ? `Pay ahead for ${membership.planName}`
            : onChangePlan
              ? `Pay for ${membership.planName}`
              : `Pay this month for ${membership.planName}`}
        </Heading>
        {amount ? (
          <Txt size={20} tabular>
            {formatMoney(amount.priceMinor, amount.currency)}
          </Txt>
        ) : null}
        <Muted>
          {extend && upfront
            ? `Your next paid months start in ${upfront.firstMonthLabel}.`
            : onChangePlan
              ? "Booking opens once this month is paid. You can leave and come back at any time."
              : (membership.warning?.headline ??
                "Pay this month to keep booking.")}
          {ahead ? " Pay ahead by cash or bank transfer." : ""}
        </Muted>
      </Stack>

      {upfront ? (
        <Card style={{ gap: 10 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Txt size={15} weight={500}>
              Months to pay
            </Txt>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Button
                label="−"
                accessibilityLabel="One month less"
                variant="outline"
                disabled={months <= 1}
                onPress={() => setMonths(months - 1)}
              />
              <Txt
                size={20}
                weight={600}
                tabular
                style={{ minWidth: 32, textAlign: "center" }}
              >
                {String(months)}
              </Txt>
              <Button
                label="+"
                accessibilityLabel="One month more"
                variant="outline"
                disabled={months >= upfront.maxMonths}
                onPress={() => {
                  setMonths(months + 1);
                  if (choice === "card") setChoice(null);
                }}
              />
            </View>
          </View>
          {months > 1 ? (
            <Muted>
              {`${upfront.firstMonthLabel} to ${formatMonth(lastMonth, "UTC")}`}
            </Muted>
          ) : null}
          {quote && quote.savingMinor > 0 ? (
            <Txt size={14} tone="success">
              {`You save ${formatMoney(quote.savingMinor, upfront.currency)}.`}
            </Txt>
          ) : null}
          {hint ? (
            <Muted>
              {hint.percent !== null
                ? `Pay ${hint.fromMonths} months or more to save ${hint.percent}%.`
                : `Pay ${hint.fromMonths} months or more for ${formatMoney(hint.monthMinor ?? 0, upfront.currency)} a month.`}
            </Muted>
          ) : null}
        </Card>
      ) : null}

      {choices.length === 0 ? (
        <EmptyState
          title="Your gym has not added a way to pay yet."
          body="Ask your gym how to pay."
        />
      ) : (
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
        >
          {choices.map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: choice === c.id }}
              onPress={() => setChoice(c.id)}
              style={{
                minHeight: 44,
                justifyContent: "center",
                paddingHorizontal: 14,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: choice === c.id ? t.primary : t.border,
                backgroundColor: choice === c.id ? t.primary : t.surface1,
              }}
            >
              <Txt
                size={15}
                weight={500}
                style={{
                  color: choice === c.id ? t.primaryForeground : t.foreground,
                }}
              >
                {c.label}
              </Txt>
            </Pressable>
          ))}
        </View>
      )}

      {choice === "card" ? (
        <CardPanel membership={membership} onReturn={onReturn} />
      ) : null}
      {method?.kind === "cash" ? (
        <CashPanel
          membership={membership}
          method={method}
          staff={options.staff}
          today={options.today}
          pay={pay}
        />
      ) : null}
      {method && method.kind !== "cash" ? (
        <TransferPanel membership={membership} method={method} pay={pay} />
      ) : null}

      {onCancel ? (
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
      ) : null}
      {onChangePlan ? (
        <Button
          label="Choose a different plan"
          variant="ghost"
          onPress={onChangePlan}
        />
      ) : null}
    </Stack>
  );
}

function useProof() {
  const toast = useToast();
  const createUpload = useMutation(trpc.storage.createUpload.mutationOptions());
  const completeUpload = useMutation(
    trpc.storage.completeUpload.mutationOptions(),
  );
  const [fileId, setFileId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    setBusy(true);
    try {
      const bytes = await pickProofJpeg();
      if (!bytes) return;
      const started = await createUpload.mutateAsync({
        kind: "payment_receipt",
        contentType: "image/jpeg",
        sizeBytes: bytes.byteLength,
      });
      const put = await fetch(started.url, {
        method: "PUT",
        headers: started.headers,
        body: bytes,
        credentials: "omit",
      });
      if (!put.ok) throw new Error(`Upload failed with ${put.status}`);
      const done = await completeUpload.mutateAsync({
        fileId: started.fileId,
      });
      setFileId(done.fileId);
    } catch (err) {
      setFileId(null);
      toast.show(
        err instanceof TRPCClientError && err.message
          ? err.message
          : "The upload failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return { fileId, busy, pick };
}

function ProofPicker({ proof }: { proof: ReturnType<typeof useProof> }) {
  return (
    <Stack gap={6}>
      <Button
        label={
          proof.fileId ? "Change the photo" : "Add a photo of your payment"
        }
        variant="outline"
        loading={proof.busy}
        onPress={() => void proof.pick()}
      />
      <Muted>
        {proof.fileId
          ? "Photo added. Only your gym sees it."
          : "A screenshot of the transfer or the receipt is enough. Only your gym sees it."}
      </Muted>
    </Stack>
  );
}

function CardPanel({
  membership,
  onReturn,
}: {
  membership: Membership;
  onReturn: () => void;
}) {
  const claim = useClaim();
  const proof = useProof();
  const academy = useQuery(trpc.academy.current.queryOptions()).data;
  const needsProof = academy?.uploadsEnabled ?? false;
  const auto =
    useQuery(trpc.cardPayment.confirmsItself.queryOptions()).data ?? false;
  return (
    <Card style={{ gap: 12 }}>
      <Muted>
        {auto
          ? "Pay on your gym's Stripe page. When Stripe confirms the payment, your membership opens on its own."
          : "Pay on your gym's Stripe page. Your gym checks card payments by hand, so send them the Stripe receipt after you pay. Booking opens when they confirm it."}
      </Muted>
      <Button
        label="Pay by card"
        onPress={() => {
          const url = membership.cardPaymentUrl;
          if (url) void WebBrowser.openBrowserAsync(url).then(onReturn);
        }}
      />
      <Muted>
        {auto
          ? "Paid, but nothing changed after a minute? Send your gym the Stripe receipt."
          : needsProof
            ? "After you pay, add the receipt Stripe emailed you."
            : "After you pay, tell your gym."}
      </Muted>
      {needsProof ? <ProofPicker proof={proof} /> : null}
      <Button
        label="I paid by card"
        variant="outline"
        loading={claim.isPending}
        disabled={proof.busy || (needsProof && !proof.fileId)}
        onPress={() =>
          claim.mutate({
            assignmentId: membership.assignmentId,
            ...(proof.fileId ? { proofFileId: proof.fileId } : {}),
          })
        }
      />
    </Card>
  );
}

function TransferPanel({
  membership,
  method,
  pay,
}: {
  membership: Membership;
  method: Method;
  pay: PayChoice;
}) {
  const claim = useClaim();
  const proof = useProof();
  const academy = useQuery(trpc.academy.current.queryOptions()).data;
  const needsProof = academy?.uploadsEnabled ?? false;
  return (
    <Card style={{ gap: 12 }}>
      <CopyField label={method.label} value={method.details} />
      {paymentMethodUsesReference(method.kind) ? (
        <CopyField
          label="Reference (add it when you send money)"
          value={membership.reference}
          data
        />
      ) : null}
      {needsProof ? <ProofPicker proof={proof} /> : null}
      <Button
        label="I paid"
        loading={claim.isPending}
        disabled={proof.busy || (needsProof && !proof.fileId)}
        onPress={() =>
          claim.mutate({
            assignmentId: membership.assignmentId,
            methodId: method.id,
            ...claimed(pay),
            ...(proof.fileId ? { proofFileId: proof.fileId } : {}),
          })
        }
      />
    </Card>
  );
}

function CashPanel({
  membership,
  method,
  staff,
  today,
  pay,
}: {
  membership: Membership;
  method: Method;
  staff: Options["staff"];
  today: string;
  pay: PayChoice;
}) {
  const t = useTheme();
  const toast = useToast();
  const claim = useClaim();
  const [paidTo, setPaidTo] = useState<string | null>(staff[0]?.userId ?? null);
  const [days] = useState(() => recentDays(today));
  const [paidOn, setPaidOn] = useState(days[0]?.key ?? "");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  return (
    <Card style={{ gap: 12 }}>
      {method.details ? <Txt size={15}>{method.details}</Txt> : null}
      <Muted>
        Pay at the gym, then tell us who took the money. Booking opens when the
        gym confirms it.
      </Muted>
      <Txt size={13} weight={500} tone="secondary">
        Who did you pay?
      </Txt>
      <View style={{ gap: 8 }}>
        {[...staff, { userId: null, name: "Someone else" }].map((s) => {
          const selected = paidTo === s.userId;
          return (
            <Pressable
              key={s.userId ?? "someone-else"}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setPaidTo(s.userId)}
              style={{
                minHeight: 44,
                justifyContent: "center",
                paddingHorizontal: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: selected ? t.primary : t.border,
                backgroundColor: selected ? t.hover : t.raised,
              }}
            >
              <Txt size={15} weight={selected ? 600 : 400}>
                {s.name}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      {paidTo === null ? (
        <TextField
          label="Their name"
          value={name}
          onChangeText={setName}
          maxLength={80}
          autoCapitalize="words"
        />
      ) : null}
      <Txt size={13} weight={500} tone="secondary">
        When did you pay?
      </Txt>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {days.map((d) => {
          const selected = paidOn === d.key;
          return (
            <Pressable
              key={d.key}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setPaidOn(d.key)}
              style={{
                minHeight: 44,
                justifyContent: "center",
                paddingHorizontal: 14,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: selected ? t.primary : t.border,
                backgroundColor: selected ? t.hover : t.raised,
              }}
            >
              <Txt size={15} weight={selected ? 600 : 400}>
                {d.label}
              </Txt>
            </Pressable>
          );
        })}
      </ScrollView>
      <TextField
        label="Note for the gym (optional)"
        value={note}
        onChangeText={setNote}
        maxLength={500}
        placeholder="Paid before Tuesday's class."
      />
      <Button
        label="I paid in cash"
        loading={claim.isPending}
        onPress={() => {
          if (paidTo === null && name.trim() === "") {
            toast.show("Write who you paid.");
            return;
          }
          claim.mutate({
            assignmentId: membership.assignmentId,
            methodId: method.id,
            ...claimed(pay),
            ...(paidTo === null
              ? { cashPaidToName: name.trim() }
              : { cashPaidTo: paidTo }),
            cashPaidOn: paidOn,
            ...(note.trim() ? { note: note.trim() } : {}),
          });
        }}
      />
    </Card>
  );
}
