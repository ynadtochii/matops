"use client";

import { useQuery } from "@tanstack/react-query";

import { VISITOR_LINK_DAYS, visitorClassState } from "@matops/domain";
import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";

import { useTRPC } from "~/trpc/react";
import { useEntity } from "./entity";
import { dropInPath } from "./invite-link-card";

interface ShareableClass {
  id: string;
  status: "scheduled" | "cancelled";
  startsAt: Date | string;
  durationMinutes: number;
}

export function ClassDropInLink({
  cls,
  label = "Copy drop-in link",
  iconOnly = false,
  className,
}: {
  cls: ShareableClass;
  label?: string;
  iconOnly?: boolean;
  className?: string;
}) {
  const trpc = useTRPC();
  const academy = useEntity();
  const shareable =
    academy.status === "active" &&
    visitorClassState(
      { ...cls, startsAt: new Date(cls.startsAt) },
      new Date(),
      academy.timeZone ?? "UTC",
      VISITOR_LINK_DAYS,
    ) !== null;
  const link = useQuery(
    trpc.dropIn.link.queryOptions(undefined, { enabled: shareable }),
  );

  if (!shareable) return null;
  if (link.isError) {
    return (
      <Button size="sm" variant="ghost" onClick={() => void link.refetch()}>
        Retry link
      </Button>
    );
  }
  if (!link.data) return null;

  return (
    <CopyButton
      value={`${window.location.origin}${dropInPath(link.data.token, link.data.sharedBy, cls.id)}`}
      label={label}
      toastMessage="Class link copied"
      variant="ghost"
      iconOnly={iconOnly}
      className={className}
    />
  );
}
