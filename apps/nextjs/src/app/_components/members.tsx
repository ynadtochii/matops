"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ellipsis, Search } from "lucide-react";

import type { RouterOutputs } from "@matops/api";
import { isPendingCoach, runsBranch } from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@matops/ui/dropdown-menu";
import { Input } from "@matops/ui/input";
import { Kbd } from "@matops/ui/kbd";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";

import { dateFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useEntity } from "./entity";
import { LeadsPipeline } from "./leads";
import { Initials, MemberDetail, MemberRow } from "./member-detail";
import { Eyebrow, RESOLVE } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";
import { Tabs } from "./tabs";

export type Member = RouterOutputs["membership"]["members"][number];
export type MemberHistory = RouterOutputs["membership"]["memberHistory"];

type MemberTab = "requests" | "members" | "leads" | "archived";

const isMemberTab = (v: string | null): v is MemberTab =>
  v === "requests" || v === "members" || v === "leads" || v === "archived";
type MemberDialog = "suspend" | "archive" | "purge";

const PEOPLE = "divide-border flex flex-col divide-y";

function walkRows(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const rows = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>("[data-row-toggle]"),
  );
  const at = rows.indexOf(document.activeElement as HTMLElement);
  const next = rows[event.key === "ArrowDown" ? at + 1 : at - 1];
  if (!next) return;
  event.preventDefault();
  next.focus();
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

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
  onPurge?: () => Promise<void>;
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
              <Ellipsis aria-hidden />
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
          {onPurge && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-error-text focus:bg-error/10 focus:text-error-text flex-col items-start gap-0.5 py-2"
                onSelect={() => setDialog("purge")}
              >
                Delete permanently
                <span className="text-error-text/70 text-2xs">
                  Erases every record
                </span>
              </DropdownMenuItem>
            </>
          )}
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
      {onPurge && (
        <ConfirmDialog
          open={dialog === "purge"}
          onOpenChange={close}
          title={`Permanently delete ${name}?`}
          description={
            <>
              This erases everything your gym holds about this person: their
              attendance record, rank and promotion history, coach notes,
              payment history and bookings. It cannot be undone, and there is no
              backup to restore from.
              <br />
              <br />
              If they ever come back they start from nothing, with no history.
              Any students they referred lose that credit. Their sign-in is
              deleted too unless they belong to another gym on MatOps.
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
      )}
    </>
  );
}

function roleLabel(m: Member): string | undefined {
  if (m.status === "pending")
    return `wants to join as ${m.invitedRole ?? "student"}`;
  return m.role === "student" ? undefined : m.role;
}

export function Members() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const memberList = useQuery(trpc.membership.members.queryOptions());
  const academy = useEntity();
  const owner = runsBranch(academy);
  const archivedList = useQuery({
    ...trpc.membership.archived.queryOptions(),
    enabled: owner,
  });

  // A member id from `?member=` (the dashboard "who's drifting" widget links
  // here) opens that member's detail on first render.
  const searchParams = useSearchParams();
  const stageParam = searchParams.get("stage");
  const memberParam = searchParams.get("member");
  const [openId, setOpenId] = useState<string | null>(memberParam);
  const toggle = (id: string) =>
    setOpenId((current) => (current === id ? null : id));

  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<MemberTab>(
    isMemberTab(tabParam)
      ? tabParam
      : memberParam !== null
        ? "members"
        : "requests",
  );
  // Drop-in leads are owner-only (`dropIn.list`), so an instructor arriving on
  // `?tab=leads` lands on the queue they can actually clear (ADR 75).
  const shownTab: MemberTab =
    (tab === "leads" || tab === "archived") && !owner ? "requests" : tab;

  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      if (isTyping(event.target) || !searchRef.current) return;
      event.preventDefault();
      searchRef.current.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const invalidate = async () => {
    await queryClient.invalidateQueries(trpc.membership.members.pathFilter());
    await queryClient.invalidateQueries(trpc.membership.archived.pathFilter());
    await queryClient.invalidateQueries(
      trpc.stats.navigationSummary.pathFilter(),
    );
  };

  const onError = (err: { message: string }) =>
    toast.error(
      err.message ||
        "Couldn't finish that. Check your connection and try again.",
    );

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
  const eraseRequests = owner
    ? members.filter(
        (m): m is Member & { erasureRequestedAt: Date } =>
          m.erasureRequestedAt !== null,
      )
    : [];
  const active = members.filter((m) => m.status !== "pending");
  const archived = archivedList.data ?? [];
  const shownActive = active.filter(
    (m) =>
      needle === "" ||
      `${m.name} ${m.email} ${m.phone ?? ""}`.toLowerCase().includes(needle),
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
          {
            id: "requests",
            label: "Requests",
            count: pending.length + eraseRequests.length,
          },
          { id: "members", label: "Members", count: active.length },
          ...(owner
            ? [
                { id: "leads" as const, label: "Drop-in leads" },
                {
                  id: "archived" as const,
                  label: "Archived",
                  count: archived.length,
                },
              ]
            : []),
        ]}
      />
      <div key={shownTab} className={RESOLVE}>
        {shownTab === "requests" ? (
          <div className="flex flex-col gap-3">
            {!listState && eraseRequests.length > 0 && (
              <>
                <Eyebrow>Asked to erase their data</Eyebrow>
                <div className={cn(PEOPLE, "mb-4")}>
                  {eraseRequests.map((m) => (
                    <MemberRow
                      key={m.memberId}
                      m={m}
                      label={`asked ${dateFmt.format(new Date(m.erasureRequestedAt))}`}
                    >
                      <ConfirmDialog
                        title={`Erase ${m.name}'s data?`}
                        description="This erases everything your gym holds about them: attendance, rank and promotion history, coach notes, payment history and bookings. It can't be undone. Their sign-in is deleted too, unless they belong to another gym on MatOps."
                        confirmLabel="Erase everything"
                        confirmPhrase={m.name}
                        variant="destructive"
                        onConfirm={async () => {
                          await purge.mutateAsync({ memberId: m.memberId });
                        }}
                        trigger={
                          <Button
                            size="sm"
                            variant="destructive-outline"
                            disabled={rowBusy(m.memberId)}
                          >
                            Erase data
                          </Button>
                        }
                      />
                    </MemberRow>
                  ))}
                </div>
                <Eyebrow>Join requests</Eyebrow>
              </>
            )}
            {listState ??
              (pending.length === 0 ? (
                <EmptyState title="No one is waiting.">
                  New sign-ups land here for you to approve. Share the student
                  link below to bring people in.
                </EmptyState>
              ) : (
                <div className={PEOPLE}>
                  {pending.map((m) => {
                    const approving =
                      approve.isPending &&
                      approve.variables.memberId === m.memberId;
                    return (
                      <MemberRow key={m.memberId} m={m} label={roleLabel(m)}>
                        <Button
                          size="sm"
                          variant="secondary"
                          busy={approving}
                          disabled={rowBusy(m.memberId)}
                          onClick={() =>
                            approve.mutate({ memberId: m.memberId })
                          }
                        >
                          Approve
                        </Button>
                        <ConfirmDialog
                          title={`Decline ${m.name}?`}
                          description="They won't join the gym. You can invite them again later with an invite link."
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
                  })}
                </div>
              ))}
          </div>
        ) : shownTab === "members" ? (
          <div className="flex flex-col gap-3">
            {!listState && active.length > 0 && (
              <div className="relative">
                <Search
                  aria-hidden
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
                />
                <Input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowDown") return;
                    const first =
                      listRef.current?.querySelector<HTMLElement>(
                        "[data-row-toggle]",
                      );
                    if (!first) return;
                    e.preventDefault();
                    first.focus();
                  }}
                  placeholder="Search by name, email or phone"
                  aria-label="Search members"
                  aria-keyshortcuts="/"
                  className="h-11 pr-24 pl-9 text-base sm:h-11"
                />
                <span className="pointer-events-none absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-2">
                  {needle ? (
                    <span
                      aria-live="polite"
                      className="text-muted-foreground text-xs tabular-nums"
                    >
                      {shownActive.length} of {active.length}
                    </span>
                  ) : (
                    <Kbd>/</Kbd>
                  )}
                </span>
              </div>
            )}
            {listState ??
              (active.length === 0 ? (
                <EmptyState title="No active members yet.">
                  Approve a pending sign-up, or share an invite link to bring
                  people in.
                </EmptyState>
              ) : shownActive.length === 0 ? (
                <EmptyState title="No one matches that search.">
                  Try part of a name, email or phone number.
                </EmptyState>
              ) : (
                <div ref={listRef} className={PEOPLE} onKeyDown={walkRows}>
                  {shownActive.map((m) => (
                    <div key={m.memberId}>
                      <div
                        className={cn(
                          "relative flex flex-col",
                          openId === m.memberId &&
                            "edge-rim-card shadow-float my-3 rounded-xl",
                        )}
                      >
                        {openId === m.memberId && (
                          <span
                            aria-hidden
                            className="bg-foreground absolute top-5 -left-px h-6 w-0.5 rounded-full shadow-[0_0_10px_color-mix(in_oklab,var(--foreground)_50%,transparent)]"
                          />
                        )}
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
                                  ? () =>
                                      restore.mutate({ memberId: m.memberId })
                                  : undefined
                              }
                              onArchive={async () => {
                                await archive.mutateAsync({
                                  memberId: m.memberId,
                                });
                              }}
                              onPurge={async () => {
                                await purge.mutateAsync({
                                  memberId: m.memberId,
                                });
                              }}
                            />
                          )}
                        </MemberRow>
                        {openId === m.memberId && <MemberDetail m={m} />}
                      </div>
                    </div>
                  ))}
                </div>
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
              <div className={PEOPLE}>
                {archived.map((m) => (
                  <div
                    key={m.memberId}
                    className="flex min-h-14 items-center gap-3 px-4 py-2"
                  >
                    <Initials name={m.name} />
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate font-medium">
                        {m.name}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {m.role === "student" ? "Joined" : `${m.role}, joined`}{" "}
                        {dateFmt.format(new Date(m.joinedAt))}
                      </p>
                    </div>
                    <MemberActions
                      name={m.name}
                      busy={rowBusy(m.memberId)}
                      onRestore={() => restore.mutate({ memberId: m.memberId })}
                      onPurge={
                        owner
                          ? async () => {
                              await purge.mutateAsync({ memberId: m.memberId });
                            }
                          : undefined
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <LeadsPipeline initialFilter={stageParam ?? undefined} />
        )}
      </div>
    </div>
  );
}
