"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import type { BranchIssue, SetupKey } from "@matops/domain";
import { entityHref } from "@matops/domain";

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
  gym: "Name your gym",
  branch: "Add your first branch",
  location: "Say where each branch is, and its time zone",
  schedule: "Put your weekly classes on the schedule",
  staff: "Bring an instructor in",
  bank: "Add the bank details members pay into",
  plan: "Make a membership plan",
  assign: "Put your members on a plan",
  ready: "Check every member is covered",
  invite: "Share your join link",
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
  staff: "staff",
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
    case "gym":
    case "bank":
      return "/settings";
    case "branch":
      return undefined;
    case "location":
      return at("/settings");
    case "schedule":
      return at("/schedule");
    case "staff":
      return at("/coaches");
    case "invite":
      return at("/members");
    case "plan":
    case "ready":
      return "/memberships";
    case "assign":
      return "/people";
  }
}

export function SetupChecklist({ compact = false }: { compact?: boolean }) {
  const trpc = useTRPC();
  const { entities } = useOrganization();
  const setup = useQuery(trpc.organization.setup.queryOptions());

  // The compact card is a reminder on a screen that has its own job, so it
  // draws nothing while it loads rather than a skeleton nobody asked for.
  if (setup.isPending) return compact ? null : <SkeletonCard />;
  // A checklist that cannot load is not worth an error state: the screen it
  // sits on still works, so it steps aside rather than shouting.
  if (setup.isError) return null;

  const { items, progress, branches } = setup.data;
  const firstBranchId = entities[0]?.id;
  const behind = branches.filter((b) => b.issues.length > 0);
  // Finished setup is not a thing to keep looking at. The card goes for good
  // once every item is done, and comes back on its own if one stops being true.
  if (progress.complete) return null;

  if (compact) {
    const next = items.find((i) => !i.done && !i.blocked);
    return (
      <section className={`${cardClass()} ${ENTER} flex flex-col gap-2`}>
        <div className="flex items-baseline justify-between gap-3">
          <Eyebrow>Setting up</Eyebrow>
          <span className="text-muted-foreground text-xs tabular-nums">
            {progress.done} of {progress.total}
          </span>
        </div>
        <p className="text-sm">
          {next ? (
            <>
              Next:{" "}
              <ItemLabel
                item={next}
                firstBranchId={firstBranchId}
                behind={behind}
                className="text-brand-strong font-medium"
              />
            </>
          ) : (
            "Waiting on the steps above."
          )}
        </p>
      </section>
    );
  }

  return (
    <section className={`${cardClass()} ${ENTER} flex flex-col gap-4`}>
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>Setting up</Eyebrow>
        <span className="text-muted-foreground text-xs tabular-nums">
          {progress.done} of {progress.total}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-3">
            <span
              aria-hidden
              className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                item.done
                  ? "bg-brand-strong border-transparent text-white"
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
    <Link href={href} className={`${className ?? ""} hover:underline`}>
      {LABELS[item.key]}
    </Link>
  );
}

const ISSUES: Record<BranchIssue, string> = {
  schedule: "nothing on the schedule",
  staff: "nobody runs it",
  membership: "no plan covers it",
  covered: "members nothing covers",
  public: "public booking on, no class shared",
};

/**
 * Which branches are not ready to open (spec FP8). A branch with nothing wrong
 * is not listed: the block exists to name work, so a gym where every branch is
 * ready draws nothing at all rather than a row of ticks.
 */
export function BranchLaunchHealth() {
  const trpc = useTRPC();
  const setup = useQuery(trpc.organization.setup.queryOptions());

  if (setup.isPending || setup.isError) return null;
  const behind = setup.data.branches.filter((b) => b.issues.length > 0);
  if (behind.length === 0) return null;

  return (
    <section className={`${cardClass()} ${ENTER} flex flex-col gap-3`}>
      <Eyebrow>Not ready to open</Eyebrow>
      <ul className="flex flex-col gap-2">
        {behind.map((b) => (
          <li key={b.id} className="flex flex-wrap items-baseline gap-x-2">
            <Link
              href={entityHref(b.id)}
              className="text-sm font-medium hover:underline"
            >
              {b.name}
            </Link>
            <span className="text-muted-foreground text-sm">
              {b.issues.map((i) => ISSUES[i]).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
