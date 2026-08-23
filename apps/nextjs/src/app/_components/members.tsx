"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import {
  isOwner,
  isPendingCoach,
  membersCsv,
  membersCsvFilename,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@matops/ui/dropdown-menu";
import { Input } from "@matops/ui/input";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";

import { dateFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useAcademy } from "./academy";
import { MemberDetail, MemberRow } from "./member-detail";
import { cardClass, Eyebrow, MoreIcon, Tabs } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";
import { VenueCheckin } from "./venue-checkin";

export type Member = RouterOutputs["membership"]["members"][number];
export type MemberHistory = RouterOutputs["membership"]["memberHistory"];

type MemberTab = "requests" | "members" | "leads" | "archived";

const isMemberTab = (v: string | null): v is MemberTab =>
  v === "requests" || v === "members" || v === "leads" || v === "archived";
type MemberDialog = "suspend" | "archive" | "purge";

function MemberActions({
  name,
  busy,
  onSuspend,
  onRestore,
  onArchive,
  onPurge,
}: {
  name: string;
  busy: boolean;
  onSuspend?: () => Promise<void>;
  onRestore?: () => void;
  onArchive?: () => Promise<void>;
  onPurge: () => Promise<void>;
}) {
  const [dialog, setDialog] = useState<MemberDialog | null>(null);
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            aria-label={`Manage ${name}`}
          >
            {busy ? (
              <Spinner size="sm" className="text-current" />
            ) : (
              <MoreIcon />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onSuspend && (
            <DropdownMenuItem onSelect={() => setDialog("suspend")}>
              Suspend
            </DropdownMenuItem>
          )}
          {onRestore && (
            <DropdownMenuItem onSelect={onRestore}>Restore</DropdownMenuItem>
          )}
          {onArchive && (
            <DropdownMenuItem onSelect={() => setDialog("archive")}>
              Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-error focus:bg-error/10 focus:text-error flex-col items-start gap-0.5 py-2"
            onSelect={() => setDialog("purge")}
          >
            Delete permanently
            <span className="text-error/60 font-mono text-[10px] tracking-wide uppercase">
              Erases every record
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {onSuspend && (
        <ConfirmDialog
          open={dialog === "suspend"}
          onOpenChange={close}
          title={`Suspend ${name}?`}
          description="They keep their place on the member list but can't book classes until you restore them."
          confirmLabel="Suspend"
          variant="primary"
          onConfirm={onSuspend}
        />
      )}
      {onArchive && (
        <ConfirmDialog
          open={dialog === "archive"}
          onOpenChange={close}
          title={`Archive ${name}?`}
          description="They lose access and their upcoming bookings are cancelled. Everything else is kept: attendance, rank, notes, payment history. You can restore them any time from the Archived tab and they pick up where they left off."
          confirmLabel="Archive member"
          variant="destructive"
          onConfirm={onArchive}
        />
      )}
      <ConfirmDialog
        open={dialog === "purge"}
        onOpenChange={close}
        title={`Permanently delete ${name}?`}
        description={
          <>
            This erases everything your gym holds about this person: their
            attendance record, rank and promotion history, coach notes, payment
            history and bookings. It cannot be undone, and there is no backup to
            restore from.
            <br />
            <br />
            If they ever come back they start from nothing, with no history. Any
            students they referred lose that credit. Their sign-in is deleted
            too unless they belong to another gym on matops.
            <br />
            <br />
            To keep their record and just end their membership, close this and
            use <strong>Archive</strong> instead.
          </>
        }
        confirmLabel="Delete everything"
        confirmPhrase={name}
        variant="destructive"
        onConfirm={onPurge}
      />
    </>
  );
}

function roleLabel(m: Member): string {
  if (m.status === "pending")
    return `wants to join as ${m.invitedRole ?? "student"}`;
  return m.role;
}

export function Members() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const memberList = useQuery(trpc.membership.members.queryOptions());
  const academy = useAcademy();
  const owner = isOwner(academy);
  const leads = useQuery({
    ...trpc.dropIn.list.queryOptions(),
    enabled: owner,
  });
  const archivedList = useQuery({
    ...trpc.membership.archived.queryOptions(),
    enabled: owner,
  });

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
  // Drop-in leads are owner-only (`dropIn.list`), so an instructor arriving on
  // `?tab=leads` lands on the queue they can actually clear (ADR 75).
  const shownTab: MemberTab =
    (tab === "leads" || tab === "archived") && !owner ? "requests" : tab;

  // "Overdue" filter chip on the Members list (spec O7, ADR 40).
  const [overdueOnly, setOverdueOnly] = useState(overdueParam);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const invalidate = async () => {
    await queryClient.invalidateQueries(trpc.membership.members.pathFilter());
    await queryClient.invalidateQueries(trpc.membership.archived.pathFilter());
  };

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
  const archive = useMutation(
    trpc.membership.archive.mutationOptions({
      onSuccess: async (res) => {
        await invalidate();
        toast.success(
          res.seatsFreed > 0
            ? `Archived. ${res.seatsFreed} upcoming ${res.seatsFreed === 1 ? "booking" : "bookings"} cancelled.`
            : "Member archived",
        );
      },
      onError,
    }),
  );
  const purge = useMutation(
    trpc.membership.purge.mutationOptions({
      onSuccess: async (res) => {
        await invalidate();
        toast.success(
          res.accountDeleted
            ? "Deleted. Every record and their sign-in are gone."
            : "Deleted. Their records here are gone; the sign-in stays because they belong to another gym.",
        );
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
  const archived = archivedList.data ?? [];
  const overdueCount = active.filter(
    (m) => m.dues?.status === "overdue",
  ).length;
  const shownActive = active.filter(
    (m) =>
      (!overdueOnly || m.dues?.status === "overdue") &&
      (needle === "" ||
        `${m.name} ${m.email} ${m.phone ?? ""}`.toLowerCase().includes(needle)),
  );
  // Pending state is scoped to the member being acted on, so approving one
  // person doesn't grey out every other row's buttons.
  const rowBusy = (id: string) =>
    (approve.isPending && approve.variables.memberId === id) ||
    (reject.isPending && reject.variables.memberId === id) ||
    (archive.isPending && archive.variables.memberId === id) ||
    (purge.isPending && purge.variables.memberId === id) ||
    (suspend.isPending && suspend.variables.memberId === id) ||
    (restore.isPending && restore.variables.memberId === id);

  const exportCsv = () => {
    const url = URL.createObjectURL(
      new Blob([membersCsv(shownActive)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = membersCsvFilename(academy.name, new Date());
    link.click();
    // The download is queued, not synchronous: revoking in this tick can cancel
    // it before the browser fetches the blob (Firefox does).
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const listState = memberList.isPending ? (
    <SkeletonRows rows={4} action gap="gap-3" />
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
        value={shownTab}
        onChange={setTab}
        tabs={[
          { id: "requests", label: "Requests", count: pending.length },
          { id: "members", label: "Members" },
          ...(owner
            ? [
                { id: "leads" as const, label: "Drop-in leads" },
                { id: "archived" as const, label: "Archived" },
              ]
            : []),
        ]}
      />
      <div>
        {shownTab === "requests" ? (
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
        ) : shownTab === "members" ? (
          <div className="flex flex-col gap-3">
            {!listState && active.length > 0 && (
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${active.length} members by name, email or phone`}
                aria-label="Search members"
              />
            )}
            {!listState && active.length > 0 && (
              <div className="flex items-center justify-between gap-3">
                <Eyebrow>
                  {overdueOnly || needle
                    ? `${shownActive.length} of ${active.length} people`
                    : `${active.length} ${active.length === 1 ? "person" : "people"}`}
                </Eyebrow>
                <div className="flex items-center gap-2">
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
                  {owner && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={shownActive.length === 0}
                      onClick={exportCsv}
                    >
                      Export CSV
                    </Button>
                  )}
                </div>
              </div>
            )}
            {listState ??
              (active.length === 0 ? (
                <EmptyState title="No active members yet.">
                  Approve a pending sign-up, or share an invite link to bring
                  people in.
                </EmptyState>
              ) : shownActive.length === 0 ? (
                needle ? (
                  <EmptyState title="No one matches that search.">
                    Try part of a name, email or phone number.
                  </EmptyState>
                ) : (
                  <EmptyState title="No overdue members.">
                    Everyone&apos;s dues are up to date.
                  </EmptyState>
                )
              ) : (
                shownActive.map((m) => (
                  <div key={m.memberId} className="flex flex-col">
                    <MemberRow
                      m={m}
                      label={roleLabel(m)}
                      open={openId === m.memberId}
                      onToggle={() => toggle(m.memberId)}
                    >
                      {owner && (
                        <MemberActions
                          name={m.name}
                          busy={rowBusy(m.memberId)}
                          onSuspend={
                            m.status === "active"
                              ? async () => {
                                  await suspend.mutateAsync({
                                    memberId: m.memberId,
                                  });
                                }
                              : undefined
                          }
                          onRestore={
                            m.status === "suspended"
                              ? () => restore.mutate({ memberId: m.memberId })
                              : undefined
                          }
                          onArchive={async () => {
                            await archive.mutateAsync({ memberId: m.memberId });
                          }}
                          onPurge={async () => {
                            await purge.mutateAsync({ memberId: m.memberId });
                          }}
                        />
                      )}
                    </MemberRow>
                    {openId === m.memberId && <MemberDetail m={m} />}
                  </div>
                ))
              ))}
          </div>
        ) : shownTab === "archived" ? (
          <div className="flex flex-col gap-3">
            {archivedList.isPending ? (
              <SkeletonRows rows={3} action gap="gap-3" />
            ) : archivedList.isError ? (
              <ErrorState
                label="archived members"
                onRetry={() => void archivedList.refetch()}
              />
            ) : archived.length === 0 ? (
              <EmptyState title="Nobody has left.">
                Members you archive land here. Their history is kept, and you
                can restore them in one click.
              </EmptyState>
            ) : (
              archived.map((m) => (
                <div
                  key={m.memberId}
                  className={cn(
                    cardClass(),
                    "flex flex-wrap items-center justify-between gap-3",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.name}</p>
                    <Eyebrow>
                      {m.role} · joined {dateFmt.format(new Date(m.joinedAt))}
                    </Eyebrow>
                  </div>
                  <MemberActions
                    name={m.name}
                    busy={rowBusy(m.memberId)}
                    onRestore={() => restore.mutate({ memberId: m.memberId })}
                    onPurge={async () => {
                      await purge.mutateAsync({ memberId: m.memberId });
                    }}
                  />
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <VenueCheckin
              academyId={academy.academyId}
              academyName={academy.name}
            />
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
