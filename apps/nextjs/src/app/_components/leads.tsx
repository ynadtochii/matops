"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import type { LeadStage, OwnerSettableStage } from "@matops/domain";
import {
  canPromoteLead,
  LEAD_SOURCE_LABEL,
  LEAD_STAGE_LABEL,
  leadFunnel,
  needsFollowUp,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import { CopyButton, copyText } from "@matops/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@matops/ui/dialog";
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
import { EmailField } from "./form-fields";
import { cardClass, Eyebrow, MoreIcon, Tabs } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";

type Lead = RouterOutputs["dropIn"]["list"][number];

type StageFilter = "all" | "trained" | LeadStage;

const FILTERS: { id: StageFilter; label: string }[] = [
  { id: "new", label: LEAD_STAGE_LABEL.new },
  { id: "trained", label: "Trained, not joined" },
  { id: "contacted", label: LEAD_STAGE_LABEL.contacted },
  { id: "invited", label: LEAD_STAGE_LABEL.invited },
  { id: "joined", label: LEAD_STAGE_LABEL.joined },
  { id: "all", label: "All" },
  { id: "ghosted", label: LEAD_STAGE_LABEL.ghosted },
];

const STAGE_TONE: Record<LeadStage, string> = {
  new: "text-brand-strong border-brand/40",
  contacted: "text-foreground border-border",
  invited: "text-foreground border-border",
  joined: "text-success border-success/40",
  ghosted: "text-muted-foreground border-border",
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
  const invites = useQuery(trpc.invite.list.queryOptions());
  const [promoting, setPromoting] = useState<Lead | null>(null);
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
  const markInvited = useMutation(
    trpc.dropIn.markInvited.mutationOptions({
      onError,
      onSettled: () => void invalidate(),
    }),
  );
  const setEmail = useMutation(
    trpc.dropIn.setEmail.mutationOptions({ onError }),
  );
  const promote = useMutation(
    trpc.dropIn.promote.mutationOptions({
      onSuccess: (res) => {
        setPromoting(null);
        toast.success(
          res.status === "active"
            ? "They're a member. They can sign in with that email."
            : "That email already has an account, so they're on the requests tab.",
        );
      },
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

  const studentToken =
    invites.data?.find((i) => i.role === "student")?.token ?? null;
  const studentLink =
    studentToken && typeof window !== "undefined"
      ? `${window.location.origin}/join/${studentToken}`
      : null;

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
        Visitors who book from your link, check in at the gym QR, or get added
        at the desk show up here to follow up.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PromoteDialog
        lead={promoting}
        busy={setEmail.isPending || promote.isPending}
        onClose={() => setPromoting(null)}
        onConfirm={async (id, email) => {
          if (email !== promoting?.email) {
            await setEmail.mutateAsync({ id, email });
          }
          promote.mutate({ id, email });
        }}
      />

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
        className="overflow-x-auto"
      />

      {shown.length === 0 ? (
        <EmptyState title="Nothing here.">
          No lead is at this stage right now.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((l) => {
            const busy =
              (setStage.isPending && setStage.variables.id === l.id) ||
              (markInvited.isPending && markInvited.variables.id === l.id);
            const activity = activityLine(l);
            const name = `${l.firstName} ${l.lastName}`.trim();
            return (
              <div
                key={l.id}
                className={cn(
                  cardClass(),
                  "flex flex-wrap items-center justify-between gap-3",
                )}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {name}
                    <span
                      className={cn(
                        "rounded-full border px-2 py-px text-[10px] uppercase",
                        STAGE_TONE[l.stage],
                      )}
                    >
                      {LEAD_STAGE_LABEL[l.stage]}
                    </span>
                    <span className="text-muted-foreground text-[10px] uppercase">
                      {LEAD_SOURCE_LABEL[l.source]}
                    </span>
                  </span>
                  <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-sm">
                    <span>{l.phone}</span>
                    <CopyButton
                      value={l.phone}
                      iconOnly
                      variant="ghost"
                      label={`Copy phone ${l.phone}`}
                      toastMessage="Phone copied"
                      className="size-6"
                    />
                    {l.email && (
                      <>
                        <span>·</span>
                        <span className="truncate">{l.email}</span>
                        <CopyButton
                          value={l.email}
                          iconOnly
                          variant="ghost"
                          label={`Copy email ${l.email}`}
                          toastMessage="Email copied"
                          className="size-6"
                        />
                      </>
                    )}
                  </span>
                  {activity && (
                    <span className="text-muted-foreground text-xs">
                      {activity}
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
                  joinLink={studentLink}
                  onStage={(stage) => setStage.mutate({ id: l.id, stage })}
                  onInvited={() => markInvited.mutate({ id: l.id })}
                  onPromote={() => setPromoting(l)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Every action on a lead, in one menu. Copying the join link and saying you
 * invited them are separate items on purpose: an owner often copies a link to
 * look at it, or sends it through a channel matops never sees, so the copy is
 * not evidence that the person was asked.
 */
function LeadActions({
  name,
  lead,
  busy,
  joinLink,
  onStage,
  onInvited,
  onPromote,
}: {
  name: string;
  lead: Lead;
  busy: boolean;
  joinLink: string | null;
  onStage: (stage: OwnerSettableStage) => void;
  onInvited: () => void;
  onPromote: () => void;
}) {
  const stage = lead.stage;
  const joined = stage === "joined";
  // A missing email is the one refusal the dialog can fix, by asking for one.
  const promotable = canPromoteLead(lead);
  const items = [
    (promotable.ok || promotable.reason === "no-email") && (
      <DropdownMenuItem key="promote" onSelect={onPromote}>
        Make them a member
      </DropdownMenuItem>
    ),
    joinLink && !joined && (
      <DropdownMenuItem
        key="link"
        onSelect={() => void copyText(joinLink, "Join link copied")}
      >
        Copy join link
      </DropdownMenuItem>
    ),
    stage === "ghosted" && (
      <DropdownMenuItem key="back" onSelect={() => onStage("contacted")}>
        Bring back
      </DropdownMenuItem>
    ),
    stage !== "contacted" && stage !== "ghosted" && !joined && (
      <DropdownMenuItem key="contacted" onSelect={() => onStage("contacted")}>
        Mark contacted
      </DropdownMenuItem>
    ),
    stage !== "invited" && stage !== "ghosted" && !joined && (
      <DropdownMenuItem key="invited" onSelect={onInvited}>
        Mark invited
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
          {busy ? <Spinner size="sm" className="text-current" /> : <MoreIcon />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items}
        {items.length > 0 && canGhost && <DropdownMenuSeparator />}
        {canGhost && (
          <DropdownMenuItem
            className="text-error focus:bg-error/10 focus:text-error"
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
      <dd className="font-mono text-2xl leading-none tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * The one place matops makes an account for someone who has not proved they own
 * the address, so the address is what the dialog is about: it is shown back
 * before anything is written, and typed here when the lead has none. A lead who
 * never agreed to be contacted never reaches this dialog.
 */
function PromoteDialog({
  lead,
  busy,
  onClose,
  onConfirm,
}: {
  lead: Lead | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (id: string, email: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const email = lead?.email ?? typed;
  const gate = lead ? canPromoteLead({ ...lead, email: email || null }) : null;

  return (
    <Dialog
      open={lead !== null}
      onOpenChange={(next) => {
        if (!next) {
          setTyped("");
          onClose();
        }
      }}
    >
      <DialogContent>
        {lead && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              onConfirm(lead.id, email.trim());
            }}
          >
            <DialogTitle>
              Make {`${lead.firstName} ${lead.lastName}`.trim()} a member?
            </DialogTitle>
            <DialogDescription>
              They sign in with this email. Nothing is sent: tell them yourself
              that they can sign in now.
            </DialogDescription>

            {lead.email ? (
              <p className="border-border bg-muted rounded-lg border px-3 py-2 font-mono text-sm">
                {lead.email}
              </p>
            ) : (
              <EmailField
                value={typed}
                onChange={setTyped}
                required
                hint="Check it with them first. A wrong address makes an account somebody else can sign into."
              />
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !gate?.ok}>
                {busy ? <Spinner size="sm" className="text-current" /> : null}
                Make them a member
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
