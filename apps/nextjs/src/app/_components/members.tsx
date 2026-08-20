"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import { isPendingCoach } from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { MemberDetail, MemberRow } from "./member-detail";
import { cardClass, Eyebrow, Tabs } from "./primitives";
import { EmptyState, ErrorState, SkeletonRows } from "./states";
import { VenueCheckin } from "./venue-checkin";

export type Member = RouterOutputs["membership"]["members"][number];
export type MemberHistory = RouterOutputs["membership"]["memberHistory"];

type MemberTab = "requests" | "members" | "leads";

const isMemberTab = (v: string | null): v is MemberTab =>
  v === "requests" || v === "members" || v === "leads";
function roleLabel(m: Member): string {
  if (m.status === "pending")
    return `wants to join as ${m.invitedRole ?? "student"}`;
  return m.role;
}

export function Members() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const memberList = useQuery(trpc.membership.members.queryOptions());
  const leads = useQuery(trpc.dropIn.list.queryOptions());
  const academy = useQuery(trpc.academy.current.queryOptions());

  // A member id from `?member=` (the dashboard "who's drifting" widget links
  // here) opens that member's detail on first render.
  const searchParams = useSearchParams();
  const overdueParam = searchParams.get("filter") === "overdue";
  const memberParam = searchParams.get("member");
  const [openId, setOpenId] = useState<string | null>(memberParam);
  const toggle = (id: string) =>
    setOpenId((current) => (current === id ? null : id));

  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<MemberTab>(
    isMemberTab(tabParam)
      ? tabParam
      : memberParam !== null || overdueParam
        ? "members"
        : "requests",
  );

  // "Overdue" filter chip on the Members list (spec O7, ADR 40).
  const [overdueOnly, setOverdueOnly] = useState(overdueParam);

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.membership.members.pathFilter());

  const onError = (err: { message: string }) =>
    toast.error(err.message || "Action failed");

  const approve = useMutation(
    trpc.membership.approve.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Approved");
      },
      onError,
    }),
  );
  const reject = useMutation(
    trpc.membership.reject.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Request declined");
      },
      onError,
    }),
  );
  const remove = useMutation(
    trpc.membership.remove.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Member removed");
      },
      onError,
    }),
  );
  const suspend = useMutation(
    trpc.membership.suspend.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Member suspended");
      },
      onError,
    }),
  );
  const restore = useMutation(
    trpc.membership.restore.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Member restored");
      },
      onError,
    }),
  );
  const members = memberList.data ?? [];
  // Coach requests are approved on the Coaches screen (O10), so this queue is
  // the student one.
  const pending = members.filter(
    (m) => m.status === "pending" && !isPendingCoach(m),
  );
  const active = members.filter((m) => m.status !== "pending");
  const overdueCount = active.filter(
    (m) => m.dues?.status === "overdue",
  ).length;
  const shownActive = overdueOnly
    ? active.filter((m) => m.dues?.status === "overdue")
    : active;
  // Pending state is scoped to the member being acted on, so approving one
  // person doesn't grey out every other row's buttons.
  const rowBusy = (id: string) =>
    (approve.isPending && approve.variables.memberId === id) ||
    (reject.isPending && reject.variables.memberId === id) ||
    (remove.isPending && remove.variables.memberId === id) ||
    (suspend.isPending && suspend.variables.memberId === id) ||
    (restore.isPending && restore.variables.memberId === id);

  const listState = memberList.isPending ? (
    <SkeletonRows rows={4} />
  ) : memberList.isError ? (
    <ErrorState
      label="the member list"
      onRetry={() => void memberList.refetch()}
    />
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      <Tabs
        label="Members view"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "requests", label: "Requests", count: pending.length },
          { id: "members", label: "Members" },
          { id: "leads", label: "Drop-in leads" },
        ]}
      />
      <div>
        {tab === "requests" ? (
          <div className="flex flex-col gap-3">
            {listState ??
              (pending.length === 0 ? (
                <EmptyState title="No one is waiting.">
                  New sign-ups land here for you to approve.
                </EmptyState>
              ) : (
                pending.map((m) => {
                  const approving =
                    approve.isPending &&
                    approve.variables.memberId === m.memberId;
                  return (
                    <MemberRow key={m.memberId} m={m} label={roleLabel(m)}>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={rowBusy(m.memberId)}
                        onClick={() => approve.mutate({ memberId: m.memberId })}
                      >
                        {approving && (
                          <Spinner size="sm" className="text-current" />
                        )}
                        {approving ? "Approving…" : "Approve"}
                      </Button>
                      <ConfirmDialog
                        title={`Decline ${m.name}?`}
                        description="They won't join the academy. You can invite them again later with an invite link."
                        confirmLabel="Decline request"
                        variant="destructive"
                        onConfirm={async () => {
                          await reject.mutateAsync({ memberId: m.memberId });
                        }}
                        trigger={
                          <Button
                            size="sm"
                            variant="destructive-outline"
                            disabled={rowBusy(m.memberId)}
                          >
                            Decline
                          </Button>
                        }
                      />
                    </MemberRow>
                  );
                })
              ))}
          </div>
        ) : tab === "members" ? (
          <div className="flex flex-col gap-3">
            {!listState && active.length > 0 && (
              <div className="flex items-center justify-between gap-3">
                <Eyebrow>
                  {overdueOnly
                    ? `${shownActive.length} of ${active.length} people`
                    : `${active.length} ${active.length === 1 ? "person" : "people"}`}
                </Eyebrow>
                {active.some((m) => m.dues) && (
                  <button
                    type="button"
                    onClick={() => setOverdueOnly((v) => !v)}
                    aria-pressed={overdueOnly}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      overdueOnly
                        ? "border-error/40 bg-error/10 text-error"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Overdue{overdueCount > 0 ? ` (${overdueCount})` : ""}
                    {overdueOnly ? " \u00d7" : ""}
                  </button>
                )}
              </div>
            )}
            {listState ??
              (active.length === 0 ? (
                <EmptyState title="No active members yet.">
                  Approve a pending sign-up, or share an invite link to bring
                  people in.
                </EmptyState>
              ) : shownActive.length === 0 ? (
                <EmptyState title="No overdue members.">
                  Everyone&apos;s dues are up to date.
                </EmptyState>
              ) : (
                shownActive.map((m) => (
                  <div key={m.memberId} className="flex flex-col">
                    <MemberRow
                      m={m}
                      label={roleLabel(m)}
                      open={openId === m.memberId}
                      onToggle={() => toggle(m.memberId)}
                    >
                      {m.status === "active" && (
                        <ConfirmDialog
                          title={`Suspend ${m.name}?`}
                          description="They keep their place on the member list but can't book classes until you restore them."
                          confirmLabel="Suspend"
                          variant="primary"
                          onConfirm={async () => {
                            await suspend.mutateAsync({ memberId: m.memberId });
                          }}
                          trigger={
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={rowBusy(m.memberId)}
                            >
                              Suspend
                            </Button>
                          }
                        />
                      )}
                      {m.status === "suspended" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={rowBusy(m.memberId)}
                          onClick={() =>
                            restore.mutate({ memberId: m.memberId })
                          }
                        >
                          {restore.isPending &&
                            restore.variables.memberId === m.memberId && (
                              <Spinner size="sm" className="text-current" />
                            )}
                          {restore.isPending &&
                          restore.variables.memberId === m.memberId
                            ? "Restoring…"
                            : "Restore"}
                        </Button>
                      )}
                      <ConfirmDialog
                        title={`Remove ${m.name}?`}
                        description="They lose access to the academy and drop off the member list. Their attendance history stays. You can invite them again later."
                        confirmLabel="Remove member"
                        variant="destructive"
                        onConfirm={async () => {
                          await remove.mutateAsync({ memberId: m.memberId });
                        }}
                        trigger={
                          <Button
                            size="sm"
                            variant="destructive-outline"
                            disabled={rowBusy(m.memberId)}
                          >
                            Remove
                          </Button>
                        }
                      />
                    </MemberRow>
                    {openId === m.memberId && <MemberDetail m={m} />}
                  </div>
                ))
              ))}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {academy.data && (
              <VenueCheckin
                academyId={academy.data.academyId}
                academyName={academy.data.name}
              />
            )}
            {leads.isError ? (
              <ErrorState
                label="drop-in leads"
                onRetry={() => void leads.refetch()}
              />
            ) : (leads.data ?? []).length === 0 ? (
              <EmptyState title="No drop-in leads yet.">
                First-time visitors who check in via the gym QR show up here to
                follow up.
              </EmptyState>
            ) : (
              <div className="flex flex-col gap-3">
                {(leads.data ?? []).map((l) => (
                  <div
                    key={l.id}
                    className={cn(
                      cardClass(),
                      "flex flex-wrap items-center justify-between gap-3",
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">
                        {l.firstName} {l.lastName}
                        {l.visitCount > 1 && (
                          <span className="text-muted-foreground ml-2 text-xs uppercase">
                            visited {l.visitCount}×
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-sm">
                        <span>{l.phone}</span>
                        <CopyButton
                          value={l.phone}
                          iconOnly
                          variant="ghost"
                          label={`Copy phone ${l.phone}`}
                          toastMessage="Phone copied"
                          className="size-6"
                        />
                        {l.email && (
                          <>
                            <span>·</span>
                            <span>{l.email}</span>
                            <CopyButton
                              value={l.email}
                              iconOnly
                              variant="ghost"
                              label={`Copy email ${l.email}`}
                              toastMessage="Email copied"
                              className="size-6"
                            />
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
