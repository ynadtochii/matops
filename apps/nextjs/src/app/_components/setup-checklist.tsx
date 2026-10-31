"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import type { BranchIssue, SetupKey } from "@matops/domain";
import { entityHref } from "@matops/domain";
import { Button } from "@matops/ui/button";

import { useTRPC } from "~/trpc/react";
import { useOrganization } from "./entity";
import { cardClass, ENTER, Eyebrow } from "./primitives";
import { SkeletonCard } from "./skeletons";

/**
 * What the gym still has to do (spec FP8).
 *
 * The wording is the owner's job, not the model's: every label names the thing
 * they would say out loud, and the server decides whether it is done. An item
 * whose turn has not come is drawn quieter rather than hidden, so the list
 * reads as an order of work instead of a wall of failures.
 */
const LABELS: Record<SetupKey, string> = {
  branch: "Add your academy",
  location: "Add your academy address and time zone",
  schedule: "Put your weekly classes on the schedule",
  invite: "Share your join link with a student",
  approve: "Approve your first student",
  booking: "Get your first booking",
  plan: "Make a membership plan",
  pay: "Add how students can pay you",
  assign: "Let students choose a plan",
  ready: "Check every member is covered",
};

const Tick = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    className="size-3"
    aria-hidden
  >
    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" strokeLinecap="round" />
  </svg>
);

/** Which branch issue a branch-level setup step is really about (ADR 129). */
const ISSUE_FOR: Partial<Record<SetupKey, BranchIssue>> = {
  schedule: "schedule",
  ready: "covered",
};

/**
 * Where each item is finished, at the branch that is actually behind (ADR 129).
 *
 * The first branch used to be the guess, which sent an owner with three mats to
 * the one that was already done. The health list names the branch each issue
 * belongs to, so the link opens that one and falls back to the first branch
 * only when nothing is flagged. `branch` has no link because its action is the
 * button beside it.
 */
function hrefFor(
  key: SetupKey,
  firstBranchId: string | undefined,
  behind: { id: string; issues: BranchIssue[] }[],
) {
  const issue = ISSUE_FOR[key];
  const flagged = issue
    ? behind.find((b) => b.issues.includes(issue))?.id
    : undefined;
  const at = (path: string) => {
    const id = flagged ?? firstBranchId;
    return id ? entityHref(id, path) : undefined;
  };
  switch (key) {
    case "pay":
      return "/memberships?tab=setup";
    case "branch":
      return undefined;
    case "location":
      return at("/settings");
    case "schedule":
      return at("/schedule");
    case "invite":
    case "approve":
      return at("/members");
    case "booking":
      return at("/schedule");
    case "plan":
      return "/memberships?tab=plans";
    case "ready":
      return "/memberships?tab=check";
    case "assign":
      return "/memberships?tab=plans";
  }
}

const closedThisSession = new Set<string>();
const closeListeners = new Set<() => void>();

function readClosed(key: string): boolean {
  if (closedThisSession.has(key)) return true;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function useSetupClosed(organizationId: string): [boolean, () => void] {
  const key = `matops:setup-closed:${organizationId}`;
  const closed = useSyncExternalStore(
    (onChange) => {
      closeListeners.add(onChange);
      return () => closeListeners.delete(onChange);
    },
    () => readClosed(key),
    () => false,
  );
  const close = () => {
    closedThisSession.add(key);
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Private windows can refuse storage; the card still closes for this visit.
    }
    closeListeners.forEach((listener) => listener());
  };
  return [closed, close];
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Close setup checklist"
      className="text-muted-foreground -my-1 size-8 p-0"
      onClick={onClose}
    >
      <X aria-hidden className="size-3.5" />
    </Button>
  );
}

export function SetupChecklist() {
  const trpc = useTRPC();
  const { entities, organizationId } = useOrganization();
  const [closed, close] = useSetupClosed(organizationId);
  const setup = useQuery({
    ...trpc.organization.setup.queryOptions(),
    enabled: !closed,
  });

  if (closed) return null;

  if (setup.isPending) return <SkeletonCard />;
  if (setup.isError)
    return (
      <div
        role="status"
        className={`${cardClass()} flex flex-wrap items-center justify-between gap-3 text-sm`}
      >
        <p>Setup progress could not load.</p>
        <Button
          variant="outline"
          size="sm"
          disabled={setup.isFetching}
          onClick={() => void setup.refetch()}
        >
          Retry setup
        </Button>
      </div>
    );

  const { items, progress, branches } = setup.data;
  const firstBranchId = entities[0]?.id;
  const behind = branches.filter((b) => b.issues.length > 0);
  // Finished setup is not a thing to keep looking at. The card goes for good
  // once every item is done, and comes back on its own if one stops being true.
  if (progress.complete) return null;

  const checklist = (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-3">
          <span className="sr-only">
            {item.done
              ? "Complete: "
              : item.blocked
                ? "Requires earlier steps: "
                : "To do: "}
          </span>
          <span
            aria-hidden
            className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
              item.done
                ? "bg-foreground text-background border-transparent"
                : "border-border"
            }`}
          >
            {item.done && <Tick />}
          </span>
          <ItemLabel
            item={item}
            firstBranchId={firstBranchId}
            behind={behind}
            className={`text-sm ${
              item.done
                ? "text-muted-foreground line-through"
                : item.blocked
                  ? "text-muted-foreground"
                  : ""
            }`}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <section className={`${cardClass()} ${ENTER} flex flex-col gap-4`}>
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>Setting up</Eyebrow>
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs tabular-nums">
            {progress.done} of {progress.total}
          </span>
          <CloseButton onClose={close} />
        </span>
      </div>
      {checklist}
    </section>
  );
}

/**
 * The label, as a link when there is somewhere to go and the owner can act on
 * it. A done item and a blocked one are text: one needs nothing, and the other
 * would send them to a screen that cannot help yet.
 */
function ItemLabel({
  item,
  firstBranchId,
  behind,
  className,
}: {
  item: { key: SetupKey; done: boolean; blocked: boolean };
  firstBranchId: string | undefined;
  behind: { id: string; issues: BranchIssue[] }[];
  className?: string;
}) {
  const href =
    item.done || item.blocked
      ? undefined
      : hrefFor(item.key, firstBranchId, behind);
  if (!href) return <span className={className}>{LABELS[item.key]}</span>;
  return (
    <Link
      href={href}
      className={`${className ?? ""} focus-visible:outline-ring inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2`}
    >
      {LABELS[item.key]}
    </Link>
  );
}
