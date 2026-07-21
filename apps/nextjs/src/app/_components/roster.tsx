"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import { Button } from "@matops/ui/button";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { EmptyState, ErrorState, SkeletonRows } from "./states";

type Member = RouterOutputs["membership"]["roster"][number];

function roleLabel(m: Member): string {
  if (m.status === "pending")
    return `wants to join as ${m.invitedRole ?? "student"}`;
  return m.role;
}

export function Roster() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const roster = useQuery(trpc.membership.roster.queryOptions());
  const leads = useQuery(trpc.dropIn.list.queryOptions());

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.membership.roster.pathFilter());

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
    trpc.membership.reject.mutationOptions({ onSuccess: invalidate, onError }),
  );
  const remove = useMutation(
    trpc.membership.remove.mutationOptions({ onSuccess: invalidate, onError }),
  );
  const suspend = useMutation(
    trpc.membership.suspend.mutationOptions({ onSuccess: invalidate, onError }),
  );
  const promote = useMutation(
    trpc.membership.promote.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Promoted to owner");
      },
      onError,
    }),
  );

  const members = roster.data ?? [];
  const pending = members.filter((m) => m.status === "pending");
  const active = members.filter((m) => m.status !== "pending");
  const busy =
    approve.isPending ||
    reject.isPending ||
    remove.isPending ||
    suspend.isPending ||
    promote.isPending;

  if (roster.isPending) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Members</h2>
        <SkeletonRows rows={4} />
      </section>
    );
  }

  if (roster.isError) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Members</h2>
        <ErrorState label="the roster" onRetry={() => void roster.refetch()} />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Pending approvals
          {pending.length > 0 && (
            <span className="bg-primary text-primary-foreground ml-2 rounded-full px-2 py-0.5 text-xs">
              {pending.length}
            </span>
          )}
        </h2>
        {pending.length === 0 ? (
          <EmptyState title="No one is waiting.">
            New sign-ups land here for you to approve.
          </EmptyState>
        ) : (
          pending.map((m) => (
            <MemberRow key={m.memberId} m={m} label={roleLabel(m)}>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => approve.mutate({ memberId: m.memberId })}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => reject.mutate({ memberId: m.memberId })}
              >
                Reject
              </Button>
            </MemberRow>
          ))
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Members</h2>
        {active.length === 0 ? (
          <EmptyState title="No active members yet.">
            Approve a pending sign-up, or share an invite link to bring people
            in.
          </EmptyState>
        ) : (
          active.map((m) => (
            <MemberRow key={m.memberId} m={m} label={roleLabel(m)}>
              {m.role !== "owner" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => promote.mutate({ memberId: m.memberId })}
                >
                  Make owner
                </Button>
              )}
              {m.status === "active" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => suspend.mutate({ memberId: m.memberId })}
                >
                  Suspend
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={busy}
                onClick={() => remove.mutate({ memberId: m.memberId })}
              >
                Remove
              </Button>
            </MemberRow>
          ))
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Drop-in leads</h2>
        {leads.isError ? (
          <ErrorState label="drop-in leads" onRetry={() => void leads.refetch()} />
        ) : (leads.data ?? []).length === 0 ? (
          <EmptyState title="No drop-in leads yet.">
            First-time visitors who check in via the gym QR show up here to
            follow up.
          </EmptyState>
        ) : (
          (leads.data ?? []).map((l) => (
            <div
              key={l.id}
              className="bg-muted flex flex-wrap items-center justify-between gap-3 rounded-lg p-4"
            >
              <div className="flex flex-col">
                <span className="font-medium">
                  {l.firstName} {l.lastName}
                  {l.visitCount > 1 && (
                    <span className="text-muted-foreground ml-2 text-xs uppercase">
                      visited {l.visitCount}×
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground text-sm">
                  {l.phone}
                  {l.email ? ` · ${l.email}` : ""}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function MemberRow({
  m,
  label,
  children,
}: {
  m: Member;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted flex flex-wrap items-center justify-between gap-3 rounded-lg p-4">
      <div className="flex flex-col">
        <span className="font-medium">
          {m.name}
          {m.status === "suspended" && (
            <span className="text-muted-foreground ml-2 text-xs uppercase">
              suspended
            </span>
          )}
        </span>
        <span className="text-muted-foreground text-sm">
          {label} · {m.email}
          {m.phone ? ` · ${m.phone}` : ""}
          {m.visitCount > 0 ? ` · attended ${m.visitCount}×` : ""}
        </span>
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}
