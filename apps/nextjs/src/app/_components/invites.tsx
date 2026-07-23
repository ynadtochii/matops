"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import { Input } from "@matops/ui/input";
import { toast } from "@matops/ui/toast";

import { shareLink, useCanShare } from "~/lib/share";
import { useTRPC } from "~/trpc/react";
import { cardClass, SectionHeading } from "./primitives";
import { ErrorState, SkeletonRows } from "./states";

type InviteRole = "student" | "instructor";
const ROLES: { role: InviteRole; label: string; hint: string }[] = [
  {
    role: "student",
    label: "Student link",
    hint: "For members who train. They land pending until you approve them.",
  },
  {
    role: "instructor",
    label: "Instructor link",
    hint: "For coaches. They also land pending — approving grants schedule + attendance tools.",
  },
];

function joinUrl(token: string): string {
  if (typeof window === "undefined") return `/join/${token}`;
  return `${window.location.origin}/join/${token}`;
}

/** Invite links live in the roster (spec O4). One shareable link per role; the
 * link grants nothing until an owner approves (docs/issues/20). */
export function Invites() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invites = useQuery(trpc.invite.list.queryOptions());

  // Offer the OS share sheet (ADR 42) only where it exists.
  const shareable = useCanShare();

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.invite.list.pathFilter());

  const create = useMutation(
    trpc.invite.create.mutationOptions({
      onSuccess: invalidate,
      onError: () => toast.error("Could not create the link"),
    }),
  );
  const rotate = useMutation(
    trpc.invite.rotate.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Link rotated — the old one no longer works");
      },
      onError: () => toast.error("Could not rotate the link"),
    }),
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <SectionHeading>Invite links</SectionHeading>
        <p className="text-muted-foreground text-sm">
          A shareable link per role. Either way the joiner lands pending until you
          approve them — a forwarded link never grants access on its own.
        </p>
      </div>
      {invites.isPending ? (
        <SkeletonRows rows={2} />
      ) : invites.isError ? (
        <ErrorState
          label="your invite links"
          onRetry={() => void invites.refetch()}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {ROLES.map(({ role, label, hint }) => {
            const invite = invites.data.find((i) => i.role === role);
            // Scope the pending state to the role being acted on, so rotating the
            // student link doesn't grey out the instructor link's button.
            const creating =
              create.isPending && create.variables.role === role;
            const rotating =
              rotate.isPending && rotate.variables.role === role;
            const url = invite ? joinUrl(invite.token) : "";
            return (
              <div key={role} className={cn(cardClass(), "flex flex-col gap-2")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{label}</span>
                  {invite ? (
                    <ConfirmDialog
                      title="Rotate this link?"
                      description="The current link stops working for everyone you already sent it to. A new link takes its place."
                      confirmLabel="Rotate link"
                      variant="destructive"
                      onConfirm={async () => {
                        await rotate.mutateAsync({ role });
                      }}
                      trigger={
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={rotating}
                        >
                          {rotating ? "Rotating…" : "Rotate"}
                        </Button>
                      }
                    />
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={creating}
                      onClick={() => create.mutate({ role })}
                    >
                      {creating ? "Creating…" : "Create link"}
                    </Button>
                  )}
                </div>
                <p className="text-muted-foreground text-sm">{hint}</p>
                {invite && (
                  <div className="flex flex-wrap gap-2">
                    <Input
                      readOnly
                      value={url}
                      aria-label={`${label} URL`}
                      className="min-w-0 flex-1"
                    />
                    {shareable && (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          void shareLink({
                            url,
                            title: "Join our academy on matops",
                            text: "Here's your link to join our academy:",
                          })
                        }
                      >
                        Share
                      </Button>
                    )}
                    <CopyButton
                      value={url}
                      variant="secondary"
                      size="default"
                      toastMessage="Link copied"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
