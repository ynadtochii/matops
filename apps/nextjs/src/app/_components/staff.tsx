"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import { isOwner } from "@matops/domain";
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
import { cardClass, MoreIcon, SectionHeading } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";

type StaffMember = RouterOutputs["membership"]["staff"][number];
type Action = "promote" | "demote";

/** Owners rank above instructors; then alphabetical by name. */
function byRoleThenName(a: StaffMember, b: StaffMember): number {
  if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function roleName(role: string): string {
  return role === "owner" ? "Owner" : "Instructor";
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
  demote: {
    title: (name) => `Step ${name} down to instructor?`,
    description:
      "They keep the schedule and attendance tools but lose owner powers — payments, settings, and staff.",
    confirmLabel: "Step down",
    variant: "destructive",
  },
};

function StaffRow({
  m,
  ownerCount,
  owner,
  busy,
  onConfirm,
}: {
  m: StaffMember;
  ownerCount: number;
  owner: boolean;
  busy: boolean;
  onConfirm: (action: Action, memberId: string) => Promise<void>;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [confirming, setConfirming] = useState(false);
  // The last active owner can't be stepped down (§4) — the server enforces it,
  // and we grey the option so the intent is clear before the click.
  const isOnlyOwner = m.role === "owner" && ownerCount <= 1;

  async function confirm(event: React.MouseEvent) {
    event.preventDefault();
    if (!action) return;
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
      </div>
      <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
        {roleName(m.role)}
      </span>
      {owner && (
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
            {m.role === "instructor" ? (
              <DropdownMenuItem onSelect={() => setAction("promote")}>
                Make co-owner
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={isOnlyOwner}
                onSelect={() => setAction("demote")}
              >
                Step down to instructor
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

/**
 * Staff section (spec O6) — the whole staff of the academy: active owners and
 * instructors. Add an instructor by sharing the instructor invite link. Owner
 * changes are rare, so they hide behind a per-person "⋯" menu (no loud button):
 * make a co-owner, or step an owner back down — never leaving the gym ownerless.
 * That menu is owners only; a manager reads the list without it (ADR 129).
 */
export function Staff() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const staff = useQuery(trpc.membership.staff.queryOptions());
  const owner = isOwner(useEntity());

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.membership.staff.pathFilter());

  const promote = useMutation(
    trpc.membership.promote.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Made co-owner");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const demote = useMutation(
    trpc.membership.setRole.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Stepped down to instructor");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const busy = promote.isPending || demote.isPending;
  const onConfirm = async (action: Action, memberId: string) => {
    if (action === "promote") await promote.mutateAsync({ memberId });
    else await demote.mutateAsync({ memberId, role: "instructor" });
  };

  const members = [...(staff.data ?? [])].sort(byRoleThenName);
  const ownerCount = members.filter((m) => m.role === "owner").length;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <SectionHeading>Staff</SectionHeading>
        <p className="text-muted-foreground text-sm">
          The owners and instructors who run this academy. Share the instructor
          link to add a coach — they land pending until you approve them.
        </p>
      </div>

      <InviteLinkCard
        role="instructor"
        label="Add an instructor"
        hint="For coaches. They land pending — approving grants schedule + attendance tools."
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
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <StaffRow
              key={m.memberId}
              m={m}
              ownerCount={ownerCount}
              owner={owner}
              busy={busy}
              onConfirm={onConfirm}
            />
          ))}
        </div>
      )}
    </section>
  );
}
