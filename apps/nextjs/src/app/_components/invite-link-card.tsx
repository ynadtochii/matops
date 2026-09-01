"use client";

import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { isOwner as isOwnerOf } from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@matops/ui/dialog";
import { Input } from "@matops/ui/input";
import { toast } from "@matops/ui/toast";

import { shareLink, useCanShare } from "~/lib/share";
import { useTRPC } from "~/trpc/react";
import { useAcademy } from "./academy";
import { cardClass } from "./primitives";
import { SkeletonInviteCard } from "./skeletons";
import { ErrorState } from "./states";

const QrPoster = dynamic(() => import("./qr-poster").then((m) => m.QrPoster));

type InviteRole = "student" | "instructor";

function joinUrl(token: string): string {
  if (typeof window === "undefined") return `/join/${token}`;
  return `${window.location.origin}/join/${token}`;
}

/**
 * One shareable invite link for a role — create / rotate / copy / share. The
 * link grants nothing until an owner approves (docs/issues/20). Self-contained:
 * it reads `invite.list` (React Query dedupes across cards) and finds its own
 * row, so both the Settings student link and the Staff instructor link reuse it.
 */
export function InviteLinkCard({
  role,
  label,
  hint,
}: {
  role: InviteRole;
  label: string;
  hint: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invites = useQuery(trpc.invite.list.queryOptions());
  const academy = useAcademy();
  const academyName = academy.name;
  const isOwner = isOwnerOf(academy);

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

  if (invites.isPending) return <SkeletonInviteCard />;
  if (invites.isError)
    return (
      <ErrorState
        label="the invite link"
        onRetry={() => void invites.refetch()}
      />
    );

  const invite = invites.data.find((i) => i.role === role);
  const url = invite ? joinUrl(invite.token) : "";

  return (
    <div className={cn(cardClass(), "flex flex-col gap-2")}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        {!isOwner ? null : invite ? (
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
                variant="destructive-outline"
                size="sm"
                busy={rotate.isPending}
                disabled={rotate.isPending}
              >
                Rotate
              </Button>
            }
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            busy={create.isPending}
            disabled={create.isPending}
            onClick={() => create.mutate({ role })}
          >
            Create link
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
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Show QR</Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm items-center">
              <DialogTitle>Scan to join</DialogTitle>
              <DialogDescription className="text-center">
                Hold this up. They scan it with their phone camera and land on
                the join form.
              </DialogDescription>
              <QrPoster
                url={url}
                title={academyName}
                caption={
                  role === "instructor"
                    ? "Scan to join as a coach"
                    : "Scan to join"
                }
                codeLabel={`Join QR code for ${academyName}`}
              />
            </DialogContent>
          </Dialog>
          {shareable && (
            <Button
              variant="secondary"
              onClick={() =>
                void shareLink({
                  url,
                  title: "Join our academy on MatOps",
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
}
