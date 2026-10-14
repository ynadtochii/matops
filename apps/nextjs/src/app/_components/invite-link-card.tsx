"use client";

import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { runsBranch } from "@matops/domain";
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
import { useEntity } from "./entity";
import { cardClass, SectionHeading } from "./primitives";
import { SkeletonCard } from "./skeletons";
import { ErrorState } from "./states";

const QrPoster = dynamic(() => import("./qr-poster").then((m) => m.QrPoster));

type InviteRole = "student" | "instructor";

function linkUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export function dropInPath(
  token: string,
  sharedBy: string | null,
  classId?: string,
): string {
  const query = new URLSearchParams();
  if (classId) query.set("class", classId);
  if (sharedBy) query.set("by", sharedBy);
  const search = query.toString();
  return `/drop-in/${token}${search ? `?${search}` : ""}`;
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
  const academyName = useEntity().name;

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.invite.list.pathFilter());

  const create = useMutation(
    trpc.invite.create.mutationOptions({
      onSuccess: invalidate,
      onError: () => toast.error("Couldn't create the link. Try again."),
    }),
  );
  const rotate = useMutation(
    trpc.invite.rotate.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Link replaced. The old one no longer works");
      },
      onError: () => toast.error("Couldn't rotate the link. Try again."),
    }),
  );

  if (invites.isPending) return <SkeletonCard lines={2} />;
  if (invites.isError)
    return (
      <ErrorState
        label="the invite link"
        onRetry={() => void invites.refetch()}
      />
    );

  const invite = invites.data.find((i) => i.role === role);
  return (
    <LinkCard
      label={label}
      hint={hint}
      url={invite ? linkUrl(`/join/${invite.token}`) : null}
      create={() => create.mutate({ role })}
      creating={create.isPending}
      rotate={() => rotate.mutateAsync({ role })}
      rotating={rotate.isPending}
      qr={{
        title: "Scan to join",
        description:
          "Hold this up. They scan it with their phone camera and land on the join form.",
        caption:
          role === "instructor" ? "Scan to join as a coach" : "Scan to join",
        codeLabel: `Join QR code for ${academyName}`,
      }}
      share={{
        title: `Join ${academyName} on MatOps`,
        text: "Here's your link to join our academy:",
      }}
    />
  );
}

export function DropInLinkCard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const link = useQuery(trpc.dropIn.link.queryOptions());
  const academyName = useEntity().name;

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.dropIn.link.pathFilter());

  const rotate = useMutation(
    trpc.dropIn.rotateLink.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Link replaced. The old one no longer works");
      },
      onError: () => toast.error("Couldn't rotate the link. Try again."),
    }),
  );

  if (link.isPending) return <SkeletonCard lines={2} />;
  if (link.isError)
    return (
      <ErrorState
        label="the drop-in link"
        onRetry={() => void link.refetch()}
      />
    );

  return (
    <LinkCard
      label="Drop-in link"
      hint="Send it to people who want to try a class. They pick a class and book without an account."
      url={linkUrl(dropInPath(link.data.token, link.data.sharedBy))}
      qrUrl={linkUrl(dropInPath(link.data.token, null))}
      rotate={() => rotate.mutateAsync()}
      rotating={rotate.isPending}
      qr={{
        title: "Scan to try a class",
        description:
          "They scan it with their phone camera and pick a class. No account needed.",
        caption: "Scan to try a class",
        codeLabel: `Drop-in QR code for ${academyName}`,
      }}
      share={{
        title: `Try a class at ${academyName}`,
        text: "Pick a class and leave your details here:",
      }}
    />
  );
}

export function DeskLinkSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const link = useQuery(trpc.desk.link.queryOptions());
  const academyName = useEntity().name;

  const rotate = useMutation(
    trpc.desk.rotateLink.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.desk.link.pathFilter());
        toast.success("Link replaced. The old one no longer works");
      },
      onError: () => toast.error("Couldn't rotate the link. Try again."),
    }),
  );

  return (
    <section className="flex flex-col gap-4">
      <div>
        <SectionHeading>Front desk tablet</SectionHeading>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm text-pretty">
          Open this link on a tablet at the desk. Students tap their name to
          check in to the class. The page does nothing else. Keep the link
          private, and rotate it if someone else gets it.
        </p>
      </div>
      {link.isPending ? (
        <SkeletonCard lines={2} />
      ) : link.isError ? (
        <ErrorState label="the desk link" onRetry={() => void link.refetch()} />
      ) : (
        <LinkCard
          label="Desk link"
          hint="Do not sign in to MatOps on the tablet. Use Guided Access (iPad) or screen pinning (Android) to keep it on this page."
          url={linkUrl(`/desk/${link.data.token}`)}
          rotate={() => rotate.mutateAsync()}
          rotating={rotate.isPending}
          qr={{
            title: "Open on the tablet",
            description:
              "Scan this with the tablet camera to open the desk page.",
            caption: "Front desk check-in",
            codeLabel: `Desk link QR code for ${academyName}`,
          }}
        />
      )}
    </section>
  );
}

export function DropInLinkButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Share drop-in link
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle>Drop-in link</DialogTitle>
        <DialogDescription>
          Copy or share this link with people who want to try a class.
        </DialogDescription>
        <DropInLinkCard />
      </DialogContent>
    </Dialog>
  );
}

function LinkCard({
  label,
  hint,
  url,
  qrUrl = url,
  create,
  creating,
  rotate,
  rotating,
  qr,
  share,
}: {
  label: string;
  hint: string;
  url: string | null;
  qrUrl?: string | null;
  create?: () => void;
  creating?: boolean;
  rotate: () => Promise<unknown>;
  rotating: boolean;
  qr: {
    title: string;
    description: string;
    caption: string;
    codeLabel: string;
  };
  share?: { title: string; text: string };
}) {
  const academy = useEntity();
  const isOwner = runsBranch(academy);
  // Offer the OS share sheet (ADR 42) only where it exists.
  const shareable = useCanShare();

  return (
    <div className={cn(cardClass(), "flex flex-col gap-2")}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        {!isOwner ? null : url ? (
          <ConfirmDialog
            title="Rotate this link?"
            description="The current link stops working for everyone you already sent it to. A new link takes its place."
            confirmLabel="Rotate link"
            variant="destructive"
            onConfirm={async () => {
              await rotate();
            }}
            trigger={
              <Button
                variant="destructive-outline"
                size="sm"
                busy={rotating}
                disabled={rotating}
              >
                Rotate
              </Button>
            }
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            busy={creating}
            disabled={creating}
            onClick={create}
          >
            Create link
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-sm">{hint}</p>
      {url && qrUrl && (
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
              <DialogTitle>{qr.title}</DialogTitle>
              <DialogDescription className="text-center">
                {qr.description}
              </DialogDescription>
              <QrPoster
                url={qrUrl}
                title={academy.name}
                caption={qr.caption}
                codeLabel={qr.codeLabel}
              />
            </DialogContent>
          </Dialog>
          {shareable && share && (
            <Button
              variant="secondary"
              onClick={() => void shareLink({ url, ...share })}
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
