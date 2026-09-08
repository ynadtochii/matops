"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import { isOwner, runsBranch } from "@matops/domain";
import { cn } from "@matops/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@matops/ui/dropdown-menu";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { useEntity } from "./entity";
import { InviteLinkCard } from "./invite-link-card";
import { cardClass, MoreIcon, RESOLVE, SectionHeading } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";

type StaffMember = RouterOutputs["membership"]["staff"][number];
type Action = "promote" | "suspend" | "archive" | "restore";

/** Owners rank above instructors; then alphabetical by name. */
function byRoleThenName(a: StaffMember, b: StaffMember): number {
  const order: Record<string, number> = { owner: 0, manager: 1, instructor: 2 };
  const rank = (order[a.role] ?? 3) - (order[b.role] ?? 3);
  if (rank !== 0) return rank;
  return a.name.localeCompare(b.name);
}

function roleName(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "manager") return "Manager";
  return "Instructor";
}

const COPY: Record<
  Action,
  {
    title: (name: string) => string;
    description: string;
    confirmLabel: string;
    variant: "primary" | "destructive";
  }
> = {
  promote: {
    title: (name) => `Make ${name} a co-owner?`,
    description:
      "Owners have full control — schedule, members, payments, and settings. You can step them back down here later.",
    confirmLabel: "Make co-owner",
    variant: "primary",
  },
  suspend: {
    title: (name) => `Suspend ${name}?`,
    description:
      "They lose staff access and cannot book classes until you restore them. They stay in Staff with their history.",
    confirmLabel: "Suspend staff access",
    variant: "destructive",
  },
  archive: {
    title: (name) => `Archive ${name}?`,
    description:
      "They lose branch access and their upcoming bookings are cancelled. Their attendance, rank, notes and payment history stay. You can restore them from Staff.",
    confirmLabel: "Archive staff",
    variant: "destructive",
  },
  restore: {
    title: (name) => `Restore ${name}?`,
    description:
      "They regain staff access without a paid membership. Their history stays. Cancelled bookings do not return.",
    confirmLabel: "Restore staff access",
    variant: "primary",
  },
};

function StaffRow({
  m,
  ownerCount,
  owner,
  manager,
  busy,
  onConfirm,
}: {
  m: StaffMember;
  ownerCount: number;
  owner: boolean;
  manager: boolean;
  busy: boolean;
  onConfirm: (action: Action, memberId: string) => Promise<void>;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [confirming, setConfirming] = useState(false);
  // The last active owner can't be stepped down (§4) — the server enforces it,
  // and we grey the option so the intent is clear before the click.
  const isOnlyOwner =
    m.role === "owner" && m.status === "active" && ownerCount <= 1;
  const canManage =
    manager &&
    m.memberId !== null &&
    !m.inheritedRole &&
    (m.role !== "owner" || owner) &&
    ["active", "suspended", "archived"].includes(m.status);

  async function confirm(event: React.MouseEvent) {
    event.preventDefault();
    if (!action || !m.memberId) return;
    setConfirming(true);
    try {
      await onConfirm(action, m.memberId);
      setAction(null);
    } finally {
      setConfirming(false);
    }
  }

  const copy = action ? COPY[action] : null;

  return (
    <div className={cn(cardClass(), "flex items-center gap-3")}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{m.name}</p>
        <p className="text-muted-foreground truncate text-sm">{m.email}</p>
        <p className="text-muted-foreground text-xs">
          {m.status === "active"
            ? "Staff access. No membership required."
            : "Staff access is inactive."}
        </p>
      </div>
      <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
        {roleName(m.status === "pending" ? (m.invitedRole ?? m.role) : m.role)}{" "}
        · {m.status}
      </span>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              aria-label={`Manage ${m.name}`}
            >
              <MoreIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {owner && m.role === "instructor" && m.status === "active" && (
              <DropdownMenuItem onSelect={() => setAction("promote")}>
                Make co-owner
              </DropdownMenuItem>
            )}
            {m.status === "active" && (
              <DropdownMenuItem
                disabled={isOnlyOwner}
                onSelect={() => setAction("suspend")}
              >
                Suspend staff access
              </DropdownMenuItem>
            )}
            {(m.status === "active" || m.status === "suspended") && (
              <DropdownMenuItem
                disabled={isOnlyOwner}
                onSelect={() => setAction("archive")}
              >
                Archive staff
              </DropdownMenuItem>
            )}
            {(m.status === "suspended" || m.status === "archived") && (
              <DropdownMenuItem onSelect={() => setAction("restore")}>
                Restore staff access
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <AlertDialog
        open={action !== null}
        onOpenChange={(next) => {
          if (!confirming && !next) setAction(null);
        }}
      >
        <AlertDialogContent>
          {copy && (
            <>
              <AlertDialogTitle>{copy.title(m.name)}</AlertDialogTitle>
              <AlertDialogDescription>
                {copy.description}
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={confirming}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  variant={copy.variant}
                  busy={confirming}
                  disabled={confirming}
                  onClick={confirm}
                >
                  {copy.confirmLabel}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function Staff() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const staff = useQuery(trpc.membership.staff.queryOptions());
  const entity = useEntity();
  const owner = isOwner(entity);
  const manager = runsBranch(entity);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.membership.pathFilter()),
      queryClient.invalidateQueries(trpc.attendance.pathFilter()),
      queryClient.invalidateQueries(trpc.class.pathFilter()),
      queryClient.invalidateQueries(trpc.stats.pathFilter()),
    ]);

  const promote = useMutation(
    trpc.membership.promote.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Made co-owner");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const suspend = useMutation(
    trpc.membership.suspend.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Staff access suspended");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const archive = useMutation(
    trpc.membership.archive.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Staff archived. Upcoming bookings cancelled.");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const restore = useMutation(
    trpc.membership.restore.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Staff access restored");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const busy =
    promote.isPending ||
    suspend.isPending ||
    archive.isPending ||
    restore.isPending;
  const onConfirm = async (action: Action, memberId: string) => {
    switch (action) {
      case "promote":
        await promote.mutateAsync({ memberId });
        break;
      case "suspend":
        await suspend.mutateAsync({ memberId });
        break;
      case "archive":
        await archive.mutateAsync({ memberId });
        break;
      case "restore":
        await restore.mutateAsync({ memberId });
    }
  };

  const members = [...(staff.data ?? [])].sort(byRoleThenName);
  const ownerCount = members.filter(
    (m) => m.role === "owner" && m.status === "active",
  ).length;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <SectionHeading>Staff</SectionHeading>
        <p className="text-muted-foreground text-sm">
          Owners, managers and instructors have staff access without a paid
          membership. New coaches wait for approval.
        </p>
      </div>

      <InviteLinkCard
        role="instructor"
        label="Add an instructor"
        hint="For coaches. Approval grants staff access, schedule and attendance tools."
      />

      {staff.isPending ? (
        <SkeletonRows rows={2} action />
      ) : staff.isError ? (
        <ErrorState label="your staff" onRetry={() => void staff.refetch()} />
      ) : members.length === 0 ? (
        <EmptyState title="No staff yet.">
          You&apos;re the only one running this academy so far.
        </EmptyState>
      ) : (
        <div className={cn("flex flex-col gap-2", RESOLVE)}>
          {members.map((m) => (
            <StaffRow
              key={m.userId}
              m={m}
              ownerCount={ownerCount}
              owner={owner}
              manager={manager}
              busy={busy}
              onConfirm={onConfirm}
            />
          ))}
        </div>
      )}
    </section>
  );
}
