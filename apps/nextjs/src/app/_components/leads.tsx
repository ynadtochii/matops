"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ellipsis } from "lucide-react";

import type { RouterOutputs } from "@matops/api";
import type { LeadStage, OwnerSettableStage } from "@matops/domain";
import type { BadgeTone } from "@matops/ui/badge";
import {
  LEAD_SOURCE_LABEL,
  LEAD_STAGE_LABEL,
  leadFunnel,
  needsFollowUp,
  signupBeltLabel,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { Badge } from "@matops/ui/badge";
import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@matops/ui/dropdown-menu";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";

import { dateYearFmt, dayShortFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { cardClass, Eyebrow, LIST, RESOLVE, TAP } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";
import { Tabs } from "./tabs";

type Lead = RouterOutputs["dropIn"]["list"][number];

type StageFilter = "all" | "trained" | LeadStage;

const FILTERS: { id: StageFilter; label: string }[] = [
  { id: "new", label: LEAD_STAGE_LABEL.new },
  { id: "trained", label: "Trained, not joined" },
  { id: "contacted", label: LEAD_STAGE_LABEL.contacted },
  { id: "joined", label: LEAD_STAGE_LABEL.joined },
  { id: "all", label: "All" },
  { id: "ghosted", label: LEAD_STAGE_LABEL.ghosted },
];

const STAGE_TONE: Record<LeadStage, BadgeTone> = {
  new: "info",
  contacted: "neutral",
  invited: "neutral",
  joined: "success",
  ghosted: "neutral",
};

function toActivity(l: Lead) {
  return {
    visits: l.visitCount,
    lastVisitAt: l.lastVisitAt ? new Date(l.lastVisitAt) : null,
    nextBookingAt: l.nextBookingAt ? new Date(l.nextBookingAt) : null,
  };
}

/** What this person did, in one line. Empty when they have done nothing yet. */
function activityLine(l: Lead): string | null {
  const a = toActivity(l);
  const parts: string[] = [];
  if (a.nextBookingAt)
    parts.push(`books ${dayShortFmt.format(a.nextBookingAt)}`);
  if (a.visits === 1) parts.push("trained once");
  if (a.visits > 1) parts.push(`trained ${a.visits} times`);
  if (a.visits > 0 && a.lastVisitAt) {
    parts.push(`last ${dateYearFmt.format(a.lastVisitAt)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function matchesFilter(l: Lead, filter: StageFilter): boolean {
  if (filter === "all") return true;
  if (filter === "trained") {
    return needsFollowUp({ stage: l.stage, activity: toActivity(l) });
  }
  return l.stage === filter;
}

export function LeadsPipeline({ initialFilter }: { initialFilter?: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const leads = useQuery(trpc.dropIn.list.queryOptions());
  const [filter, setFilter] = useState<StageFilter>(
    FILTERS.some((f) => f.id === initialFilter)
      ? (initialFilter as StageFilter)
      : "new",
  );

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.dropIn.list.pathFilter());
  const onError = (err: { message: string }) => toast.error(err.message);

  const setStage = useMutation(
    trpc.dropIn.setStage.mutationOptions({
      onError,
      onSettled: () => void invalidate(),
    }),
  );
  const rows = useMemo(() => leads.data ?? [], [leads.data]);
  const funnel = useMemo(
    () =>
      leadFunnel(
        rows.map((l) => ({ stage: l.stage, activity: toActivity(l) })),
      ),
    [rows],
  );
  const newCount = rows.filter((l) => matchesFilter(l, "new")).length;

  const shown = rows.filter((l) => matchesFilter(l, filter));

  if (leads.isPending) return <SkeletonRows rows={4} />;
  if (leads.isError) {
    return (
      <ErrorState label="drop-in leads" onRetry={() => void leads.refetch()} />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState title="No drop-in leads yet.">
        Visitors who book or check in from your drop-in link show up here to
        follow up.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FunnelStat label="Leads" value={funnel.created} />
        <FunnelStat label="Booked" value={funnel.booked} />
        <FunnelStat label="Trained" value={funnel.trained} />
        <FunnelStat label="Joined" value={funnel.joined} />
      </dl>

      <Tabs
        label="Filter leads by stage"
        value={filter}
        onChange={setFilter}
        tabs={FILTERS.map((f) => ({
          id: f.id,
          label: f.label,
          count: f.id === "new" ? newCount : undefined,
        }))}
      />

      {shown.length === 0 ? (
        <EmptyState title="No leads at this stage.">
          Pick another stage, or wait for the next visitor.
        </EmptyState>
      ) : (
        <div key={filter} className={cn(LIST, RESOLVE)}>
          {shown.map((l) => {
            const busy = setStage.isPending && setStage.variables.id === l.id;
            const activity = activityLine(l);
            const name = `${l.firstName} ${l.lastName}`.trim();
            return (
              <div
                key={l.id}
                className="flex min-h-11 flex-wrap items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-foreground flex flex-wrap items-center gap-2 font-medium">
                    {name}
                    <Badge tone={STAGE_TONE[l.stage]}>
                      {LEAD_STAGE_LABEL[l.stage]}
                    </Badge>
                    <span className="text-muted-foreground text-xs font-normal">
                      {LEAD_SOURCE_LABEL[l.source]}
                    </span>
                  </span>
                  <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-sm">
                    <span className="font-mono tabular-nums">{l.phone}</span>
                    <CopyButton
                      value={l.phone}
                      iconOnly
                      variant="ghost"
                      label={`Copy phone ${l.phone}`}
                      toastMessage="Phone copied"
                      className={TAP}
                    />
                    {l.email && (
                      <>
                        <span>·</span>
                        <span className="min-w-0 truncate">{l.email}</span>
                        <CopyButton
                          value={l.email}
                          iconOnly
                          variant="ghost"
                          label={`Copy email ${l.email}`}
                          toastMessage="Email copied"
                          className={TAP}
                        />
                      </>
                    )}
                  </span>
                  {activity && (
                    <span className="text-muted-foreground text-xs">
                      {activity}
                    </span>
                  )}
                  {l.sharedBy && (
                    <span className="text-muted-foreground text-xs">
                      Brought by {l.sharedBy.name} · {l.sharedBy.kind}
                    </span>
                  )}
                  {l.belt && (
                    <span className="text-muted-foreground text-xs">
                      {signupBeltLabel(l.belt, l.stripes ?? 0)}
                      {l.emailUpdates ? " · wants email updates" : ""}
                    </span>
                  )}
                  {l.health && (
                    <span className="text-foreground text-xs whitespace-pre-wrap">
                      Health: {l.health}
                    </span>
                  )}
                  {!l.consent && (
                    <span className="text-warning text-xs">
                      Did not agree to be contacted
                    </span>
                  )}
                </div>

                <LeadActions
                  name={name}
                  lead={l}
                  busy={busy}
                  onStage={(stage) => setStage.mutate({ id: l.id, stage })}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LeadActions({
  name,
  lead,
  busy,
  onStage,
}: {
  name: string;
  lead: Lead;
  busy: boolean;
  onStage: (stage: OwnerSettableStage) => void;
}) {
  const stage = lead.stage;
  const joined = stage === "joined";
  const items = [
    stage !== "contacted" && !joined && (
      <DropdownMenuItem key="contacted" onSelect={() => onStage("contacted")}>
        Mark contacted
      </DropdownMenuItem>
    ),
  ].filter(Boolean);

  const canGhost = stage !== "ghosted" && !joined;
  if (items.length === 0 && !canGhost) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          aria-label={`Manage ${name}`}
        >
          {busy ? (
            <Spinner size="sm" className="text-current" />
          ) : (
            <Ellipsis aria-hidden />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items}
        {items.length > 0 && canGhost && <DropdownMenuSeparator />}
        {canGhost && (
          <DropdownMenuItem
            className="text-error-text focus:bg-error/10 focus:text-error-text"
            onSelect={() => onStage("ghosted")}
          >
            Mark ghosted
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FunnelStat({ label, value }: { label: string; value: number }) {
  return (
    <div className={cn(cardClass(), "flex flex-col gap-1 p-3")}>
      <Eyebrow>{label}</Eyebrow>
      <dd className="text-foreground text-2xl leading-none font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}
