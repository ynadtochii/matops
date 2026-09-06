"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { entityHref, isPendingCoach, staffRows } from "@matops/domain";
import { Button } from "@matops/ui/button";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";

import { useTRPC } from "~/trpc/react";
import { useOrganization } from "./entity";
import { PageHeader } from "./page-header";
import { cardClass, ENTER, Eyebrow } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";

/**
 * Everyone who runs a branch, one row per person (ADR 127).
 *
 * A lens over the member directory rather than a second read, so this screen
 * and the Members screen cannot disagree about who somebody is.
 *
 * It never becomes a second place to edit anybody: the badge opens that
 * branch's Coaches page, where approving, promoting and setting a role live.
 * Same rule as the member directory (GB5).
 */
export function StaffScreen() {
  const trpc = useTRPC();
  const { canRunOrganization } = useOrganization();
  const directory = useQuery(trpc.stats.organizationMembers.queryOptions());
  const [entityId, setEntityId] = useState("");

  const rows = useMemo(
    () => staffRows(directory.data?.rows ?? []),
    [directory.data],
  );
  const shown = useMemo(
    () =>
      entityId
        ? rows.filter((r) => r.branches.some((b) => b.entityId === entityId))
        : rows,
    [rows, entityId],
  );

  if (!canRunOrganization) {
    return (
      <EmptyState title="Only an owner sees the whole gym's staff.">
        Your own branch's coaches are on its Coaches screen.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Staff"
        subtitle="Everyone who runs a branch, and who is waiting to."
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="staff-branch">Branch</Label>
          <Select
            id="staff-branch"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
          >
            <option value="">Any branch</option>
            {(directory.data?.entities ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {directory.isPending ? (
        <SkeletonRows rows={3} />
      ) : directory.isError ? (
        <ErrorState
          label="your staff"
          onRetry={() => void directory.refetch()}
        />
      ) : shown.length === 0 ? (
        <EmptyState title="Only you so far.">
          Invite a coach from a branch&apos;s Coaches page.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((r) => (
            <li key={r.userId} className={`${cardClass()} ${ENTER}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted-foreground text-sm">
                    {r.email}
                  </span>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {r.branches.map((b) => (
                    <Button
                      key={b.entityId}
                      asChild
                      size="sm"
                      variant="outline"
                    >
                      <Link href={entityHref(b.entityId, "/coaches")}>
                        {b.entityName} ·{" "}
                        {isPendingCoach(b) ? "waiting" : b.role}
                      </Link>
                    </Button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground text-sm">
        Approving, promoting and setting a role happen on that branch&apos;s
        Coaches page. The badge takes you there.
      </p>

      <Eyebrow>
        {shown.length === 1 ? "1 person" : `${shown.length} people`}
      </Eyebrow>
    </div>
  );
}
