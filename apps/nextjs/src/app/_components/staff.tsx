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
import { LIST, MoreIcon, RESOLVE, SectionHeading } from "./primitives";
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
      "Owners get full control: schedule, members, payments and settings. You can step them back down here later.",
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
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate font-medium">{m.name}</p>
        <p className="text-muted-foreground truncate text-xs">{m.email}</p>
        <p className="text-foreground-secondary text-xs">
          {roleName(
            m.status === "pending" ? (m.invitedRole ?? m.role) : m.role,
          )}
          {m.status === "active" ? "" : ` · ${m.status}`}
        </p>
      </div>
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

  // Scoped to the person being acted on, so suspending one coach does not grey
  // out every other row's menu.
  const rowBusy = (memberId: string | null) =>
    memberId !== null &&
    ((promote.isPending && promote.variables.memberId === memberId) ||
      (suspend.isPending && suspend.variables.memberId === memberId) ||
      (archive.isPending && archive.variables.memberId === memberId) ||
      (restore.isPending && restore.variables.memberId === memberId));
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
          Invite coaches and manage staff access.
        </p>
      </div>

      {staff.isPending ? (
        <SkeletonRows rows={2} action inList />
      ) : staff.isError ? (
        <ErrorState label="your staff" onRetry={() => void staff.refetch()} />
      ) : members.length === 0 ? (
        <EmptyState title="No staff yet.">
          You&apos;re the only one running this branch so far.
        </EmptyState>
      ) : (
        <div className={cn(LIST, RESOLVE)}>
          {members.map((m) => (
            <StaffRow
              key={m.userId}
              m={m}
              ownerCount={ownerCount}
              owner={owner}
              manager={manager}
              busy={rowBusy(m.memberId)}
              onConfirm={onConfirm}
            />
          ))}
        </div>
      )}

      <InviteLinkCard
        role="instructor"
        label="Invite a coach"
        hint="They get staff access after you approve them."
      />
    </section>
  );
}
