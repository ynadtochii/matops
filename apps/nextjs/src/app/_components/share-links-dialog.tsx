"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { isOwner as isOwnerOf } from "@matops/domain";
import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@matops/ui/dialog";
import { toast } from "@matops/ui/toast";

import { shareLink, useCanShare } from "~/lib/share";
import { useTRPC } from "~/trpc/react";
import { useAcademy } from "./academy";
import { cardClass } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { ErrorState } from "./states";

const QrPoster = dynamic(() => import("./qr-poster").then((m) => m.QrPoster));

function absolute(path: string): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

/**
 * The two links staff are asked for when someone messages the gym: "can I try a
 * class?" and "how do I sign up?". Reachable from the shell on every screen, so
 * answering is two taps rather than a walk into Settings, and both links sit
 * next to each other so nobody sends the wrong one. Staff, not owner-only.
 *
 * It copies the links rather than moving them: Settings keeps the public
 * booking setup and Members keeps the invite card, which are where an owner
 * configures them. This is the place you reach with someone waiting for a reply.
 */
export function ShareLinksDialog({ trigger }: { trigger: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle>Send someone a link</DialogTitle>
        <DialogDescription>
          Someone asking about training needs one of these.
        </DialogDescription>
        <ShareLinksBody />
      </DialogContent>
    </Dialog>
  );
}

function ShareLinksBody() {
  const trpc = useTRPC();
  const academy = useAcademy();
  const isOwner = isOwnerOf(academy);
  const links = useQuery(trpc.academy.shareLinks.queryOptions());
  const invites = useQuery(trpc.invite.list.queryOptions());

  if (links.isPending || invites.isPending) return <SkeletonRows rows={2} />;
  if (links.isError || invites.isError) {
    return (
      <ErrorState
        label="your links"
        onRetry={() => {
          void links.refetch();
          void invites.refetch();
        }}
      />
    );
  }

  const invite = invites.data.find((i) => i.role === "student");

  return (
    <div className="flex flex-col gap-3">
      <BookingRow settings={links.data} isOwner={isOwner} />
      <CheckInRow />
      <JoinRow token={invite?.token ?? null} isOwner={isOwner} />
    </div>
  );
}

function BookingRow({
  settings,
  isOwner,
}: {
  settings: {
    bookingEnabled: boolean;
    publicCode: string;
    hasSharedClass: boolean;
  };
  isOwner: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const academyName = useAcademy().name;

  const turnOn = useMutation(
    trpc.academy.setPublicApi.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.academy.shareLinks.pathFilter()),
          queryClient.invalidateQueries(trpc.academy.publicApi.pathFilter()),
        ]);
        toast.success("Public booking is on");
      },
      onError: (err) => toast.error(err.message || "Could not turn it on"),
    }),
  );

  if (!settings.bookingEnabled) {
    return (
      <LinkCard
        title="Book a trial"
        hint="For someone who has never trained here. They pick a class and book it, with no account."
      >
        <p className="text-muted-foreground text-sm">
          Public booking is off, so this link does not work yet.
          {!isOwner && " Ask the owner to turn it on in Settings."}
        </p>
        {isOwner && (
          <Button
            size="sm"
            className="self-start"
            busy={turnOn.isPending}
            disabled={turnOn.isPending}
            onClick={() => turnOn.mutate({ enabled: true })}
          >
            Turn on public booking
          </Button>
        )}
      </LinkCard>
    );
  }

  return (
    <LinkCard
      title="Book a trial"
      hint="For someone who has never trained here. They pick a class and book it, with no account."
    >
      <LinkActions
        url={absolute(`/book/${settings.publicCode}`)}
        shareTitle={`Book a class at ${academyName}`}
        shareText="Pick a class and book here:"
        qrTitle={academyName}
        qrCaption="Scan to book a class"
        qrCodeLabel={`Booking QR code for ${academyName}`}
      />
      {!settings.hasSharedClass && (
        <p className="text-warning text-sm">
          No class is open for booking in the next week, so this link opens an
          empty page. Tick a class as shared in Schedule → Templates.
        </p>
      )}
    </LinkCard>
  );
}

function CheckInRow() {
  const { academyId, name } = useAcademy();

  return (
    <LinkCard
      title="Drop in at the gym"
      hint="For someone already on the mat. A first-time visitor leaves their details, a member checks in. This is the wall poster, as a link."
    >
      <LinkActions
        url={absolute(`/checkin/${academyId}`)}
        shareTitle={`Check in at ${name}`}
        shareText="Scan or open this to check in:"
        qrTitle={name}
        qrCaption="Scan to check in"
        qrCodeLabel={`Check-in QR code for ${name}`}
      />
    </LinkCard>
  );
}

function JoinRow({
  token,
  isOwner,
}: {
  token: string | null;
  isOwner: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const academyName = useAcademy().name;

  const create = useMutation(
    trpc.invite.create.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries(trpc.invite.list.pathFilter()),
      onError: () => toast.error("Could not create the link"),
    }),
  );

  return (
    <LinkCard
      title="Join the academy"
      hint="For someone who has decided to sign up. They land pending until an owner approves them."
    >
      {token ? (
        <LinkActions
          url={absolute(`/join/${token}`)}
          shareTitle={`Join ${academyName}`}
          shareText="Here's your link to join our academy:"
          qrTitle={academyName}
          qrCaption="Scan to join"
          qrCodeLabel={`Join QR code for ${academyName}`}
        />
      ) : isOwner ? (
        <Button
          size="sm"
          className="self-start"
          busy={create.isPending}
          disabled={create.isPending}
          onClick={() => create.mutate({ role: "student" })}
        >
          Create link
        </Button>
      ) : (
        <p className="text-muted-foreground text-sm">
          There is no join link yet. Ask the owner to create one.
        </p>
      )}
    </LinkCard>
  );
}

function LinkCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className={`${cardClass()} flex flex-col gap-2`}>
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground text-sm">{hint}</p>
      {children}
    </div>
  );
}

function LinkActions({
  url,
  shareTitle,
  shareText,
  qrTitle,
  qrCaption,
  qrCodeLabel,
}: {
  url: string;
  shareTitle: string;
  shareText: string;
  qrTitle: string;
  qrCaption: string;
  qrCodeLabel: string;
}) {
  const [showQr, setShowQr] = useState(false);
  const shareable = useCanShare();

  return (
    <div className="flex flex-col gap-2">
      <code className="text-sm break-all">{url}</code>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={url} label="Copy link" toastMessage="Link copied" />
        {shareable && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void shareLink({ url, title: shareTitle, text: shareText })
            }
          >
            Share
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          aria-expanded={showQr}
          onClick={() => setShowQr((open) => !open)}
        >
          {showQr ? "Hide QR" : "Show QR"}
        </Button>
      </div>
      {showQr && (
        <QrPoster
          url={url}
          title={qrTitle}
          caption={qrCaption}
          codeLabel={qrCodeLabel}
        />
      )}
    </div>
  );
}
