"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  entityHref,
  formatMoney,
  isPendingCoach,
  matchesDirectoryFilter,
  matchPeopleByEmail,
  parseEmailList,
  staffRows,
} from "@matops/domain";
import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { useOrganization } from "./entity";
import { cardClass, ENTER, Eyebrow, Tabs } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";

/**
 * Everybody the organization knows, one row per PERSON (ADR 126).
 *
 * A branch's own Roster stays the daily list for running that branch. This is
 * the owner's view across branches, and it never becomes a second place to edit
 * somebody: clicking a branch badge opens that branch's Roster, where the
 * actions live.
 *
 * Branch counts here are ENROLMENTS, not people. One person training at two
 * branches is one row with two badges, which is exactly the number a head count
 * needs and the number a per-branch total gets wrong.
 *
 * Staff is a TAB rather than a screen of its own (ADR 129): the same rows,
 * filtered by `staffRows`, so the two lists cannot disagree about who somebody
 * is. The tab is in the URL, so `/people?tab=staff` is linkable and the old
 * `/staff` redirects onto it.
 */
export function PeopleScreen() {
  const trpc = useTRPC();
  const { canRunOrganization } = useOrganization();
  const directory = useQuery(trpc.stats.organizationMembers.queryOptions());
  const tabParam = useSearchParams().get("tab");
  const [tab, setTab] = useState<PeopleTab>(
    tabParam === "staff" ? "staff" : "people",
  );
  const [search, setSearch] = useState("");
  const [entityId, setEntityId] = useState("");
  const [planName, setPlanName] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  // Memoised so the `?? []` fallback is not a new array on every render, which
  // would defeat the two useMemo hooks below.
  const rows = useMemo(() => directory.data?.rows ?? [], [directory.data]);
  const plans = useMemo(
    () => [...new Set(rows.flatMap((r) => r.planNames))].sort(),
    [rows],
  );
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (tab === "staff" ? staffRows(rows) : rows)
      .filter((r) =>
        matchesDirectoryFilter(r, {
          entityId: entityId || undefined,
          planName: planName || undefined,
          status: status || undefined,
        }),
      )
      .filter(
        (r) =>
          !needle ||
          r.name.toLowerCase().includes(needle) ||
          r.email.toLowerCase().includes(needle),
      );
  }, [rows, tab, search, entityId, planName, status]);

  if (!canRunOrganization) {
    return (
      <div>
        <EmptyState title="Only the people who run this gym see everybody in it.">
          The people who train at your branch are on its Roster.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">People</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Everybody across your branches. One row per person, however many
            branches they train at.
          </p>
        </div>
      </div>

      <Tabs
        label="People or staff"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "people", label: "People", count: rows.length },
          { id: "staff", label: "Staff", count: staffRows(rows).length },
        ]}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor="people-search">Search</Label>
          <Input
            id="people-search"
            value={search}
            placeholder="Name or email"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="people-branch">Branch</Label>
          <Select
            id="people-branch"
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="people-plan">Membership</Label>
          <Select
            id="people-plan"
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
          >
            <option value="">Any membership</option>
            {plans.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="people-status">Status</Label>
          <Select
            id="people-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Any status</option>
            {["active", "pending", "suspended", "archived"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {directory.isPending ? (
        <SkeletonRows rows={4} />
      ) : directory.isError ? (
        <ErrorState
          label="your members"
          onRetry={() => void directory.refetch()}
        />
      ) : shown.length === 0 ? (
        <EmptyState title="Nobody matches that.">
          Clear a filter, or check another branch.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((r) => (
            <li key={r.userId} className={`${cardClass()} ${ENTER}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  aria-label={`Select ${r.name}`}
                  checked={selected.includes(r.userId)}
                  onChange={(e) =>
                    setSelected((was) =>
                      e.target.checked
                        ? [...was, r.userId]
                        : was.filter((id) => id !== r.userId),
                    )
                  }
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link
                    href={`/people/${r.userId}`}
                    className="font-medium hover:underline"
                  >
                    {r.name}
                  </Link>
                  <span className="text-muted-foreground text-sm">
                    {r.email}
                    {r.recentVisits > 0
                      ? ` · ${r.recentVisits} visits in 30 days`
                      : " · no visits in 30 days"}
                  </span>
                  {r.planNames.length > 0 && (
                    <span className="text-muted-foreground text-sm">
                      {r.planNames.join(", ")}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {r.branches.map((b) => (
                    <Button
                      key={b.entityId}
                      asChild
                      size="sm"
                      variant="outline"
                    >
                      {/* Straight to this person at that branch, on the tab
                          their standing belongs to, so nobody searches twice
                          (ADR 129). */}
                      <Link href={branchHref(b, tab)}>
                        {b.entityName}
                        {b.status !== "active" ? ` · ${b.status}` : ""}
                        {b.verdict && b.verdict !== "ok" ? " ·  ⚠" : ""}
                      </Link>
                    </Button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selected.length > 0 && (
        <BulkAssign selected={selected} onDone={() => setSelected([])} />
      )}

      <div className="flex flex-wrap gap-2">
        <PasteEmails people={rows} onMatched={(ids) => setSelected(ids)} />
        <FromBranchPlan onPicked={(ids) => setSelected(ids)} />
      </div>

      <Eyebrow>
        {shown.length === 1 ? "1 person" : `${shown.length} people`}
      </Eyebrow>
    </div>
  );
}

type PeopleTab = "people" | "staff";

/**
 * Where a branch badge goes: that person at that branch, on the tab their
 * standing belongs to. A coach seat is decided on Coaches, an archived member
 * is on the Archived tab, and everybody else is on Members (ADR 129).
 */
function branchHref(
  b: {
    entityId: string;
    memberId: string;
    status: string;
    role: string;
    invitedRole: string | null;
  },
  tab: PeopleTab,
): string {
  if (tab === "staff" || isPendingCoach(b)) {
    return entityHref(b.entityId, "/coaches");
  }
  const branchTab =
    b.status === "pending"
      ? "requests"
      : b.status === "archived"
        ? "archived"
        : "members";
  return entityHref(
    b.entityId,
    `/members?tab=${branchTab}&member=${encodeURIComponent(b.memberId)}`,
  );
}

/**
 * Put the selected people on one plan (spec FP8).
 *
 * It reports what happened per person rather than a bare "done": a run where
 * three of forty were already on the plan and one has left the gym is a normal
 * outcome, and an owner who is not told that will go looking for the rest.
 */
function BulkAssign({
  selected,
  onDone,
}: {
  selected: string[];
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const plans = useQuery(trpc.accessPlan.list.queryOptions());
  const [planId, setPlanId] = useState("");

  const assign = useMutation(
    trpc.accessPlan.assignMany.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries();
        if (result.failed === 0) {
          toast.success(
            result.placed === 1
              ? "1 person put on the plan"
              : `${result.placed} people put on the plan`,
          );
          setPlanId("");
          onDone();
          return;
        }
        // Named, not counted: the owner has to know WHO to go back to.
        toast.error(
          `${result.placed} placed, ${result.failed} not: ${result.results
            .filter((r) => r.outcome === "failed")
            .map((r) => r.reason ?? "could not add it")
            .join("; ")}`,
        );
      },
      onError: (e) => toast.error(e.message || "Could not put them on it"),
    }),
  );

  return (
    <div
      className={`${cardClass()} flex flex-wrap items-end gap-3`}
      role="group"
      aria-label="Put the selected people on a plan"
    >
      <div className="flex min-w-48 flex-1 flex-col gap-2">
        <Eyebrow as="span">
          {selected.length === 1
            ? "1 person selected"
            : `${selected.length} people selected`}
        </Eyebrow>
        <Select
          id="bulk-plan"
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
        >
          <option value="">Pick a plan…</option>
          {(plans.data ?? [])
            .filter((p) => !p.archived)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.priceMinor !== null && p.currency
                  ? `${p.name} · ${formatMoney(p.priceMinor, p.currency)} a month`
                  : `${p.name} · no price yet`}
              </option>
            ))}
        </Select>
      </div>
      <Button
        size="sm"
        disabled={planId === "" || assign.isPending}
        onClick={() => assign.mutate({ userIds: selected, planId })}
      >
        {assign.isPending ? "Adding…" : "Put them on it"}
      </Button>
      <Button size="sm" variant="outline" onClick={onDone}>
        Clear
      </Button>
    </div>
  );
}

/**
 * Take a pasted list of emails and turn it into a selection (spec FP8).
 *
 * It selects rather than assigns, so the owner sees exactly who they are about
 * to touch before anything is written, and the plan picker above is the one
 * place a membership is given. Anything the gym does not recognise is named
 * back rather than silently dropped: a typo in a spreadsheet must not turn
 * into a member who quietly never got their membership.
 */
function PasteEmails({
  people,
  onMatched,
}: {
  people: { userId: string; email: string }[];
  onMatched: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [unmatched, setUnmatched] = useState<string[]>([]);

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        Paste a list of emails
      </Button>
    );
  }

  return (
    <div className={`${cardClass()} flex flex-col gap-3`}>
      <Label htmlFor="paste-emails">
        Paste emails, from a spreadsheet or anywhere else
      </Label>
      <Textarea
        id="paste-emails"
        rows={4}
        value={text}
        placeholder="ana@example.com, bea@example.com"
        onChange={(e) => setText(e.target.value)}
      />
      {unmatched.length > 0 && (
        <p className="text-muted-foreground text-sm">
          Not in this gym, so not selected: {unmatched.join(", ")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            const found = matchPeopleByEmail(people, parseEmailList(text));
            setUnmatched(found.unmatched);
            onMatched(found.matched);
            if (found.matched.length === 0) {
              toast.error("None of those emails belong to this gym");
            }
          }}
        >
          Select them
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setOpen(false);
            setText("");
            setUnmatched([]);
          }}
        >
          Close
        </Button>
      </div>
    </div>
  );
}

/**
 * Select everybody on one branch's old dues plan (spec FP8).
 *
 * This is the migration in the owner's own words: the people who were on the
 * mat's Adults plan should go onto the new shared one. It selects rather than
 * assigns, like the paste above, so the plan picker stays the single place a
 * membership is given and the owner sees who they are about to move.
 */
function FromBranchPlan({ onPicked }: { onPicked: (ids: string[]) => void }) {
  const trpc = useTRPC();
  const { entities } = useOrganization();
  const [open, setOpen] = useState(false);
  const [entityId, setEntityId] = useState("");
  const [planId, setPlanId] = useState("");

  const legacy = useQuery({
    ...trpc.accessPlan.legacyPlanMembers.queryOptions({ entityId }),
    enabled: open && entityId !== "",
  });

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Select from a branch plan
      </Button>
    );
  }

  const onPlan = (legacy.data?.members ?? []).filter(
    (m) => planId === "" || m.planId === planId,
  );

  return (
    <div className={`${cardClass()} flex w-full flex-wrap items-end gap-3`}>
      <div className="flex min-w-40 flex-1 flex-col gap-2">
        <Label htmlFor="legacy-branch">Branch</Label>
        <Select
          id="legacy-branch"
          value={entityId}
          onChange={(e) => {
            setEntityId(e.target.value);
            setPlanId("");
          }}
        >
          <option value="">Pick a branch…</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex min-w-40 flex-1 flex-col gap-2">
        <Label htmlFor="legacy-plan">Its old plan</Label>
        <Select
          id="legacy-plan"
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          disabled={entityId === "" || legacy.isPending}
        >
          <option value="">Every plan there</option>
          {(legacy.data?.plans ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {formatMoney(p.priceMinor, p.currency)}
            </option>
          ))}
        </Select>
      </div>
      <Button
        size="sm"
        disabled={entityId === "" || onPlan.length === 0}
        onClick={() => onPicked([...new Set(onPlan.map((m) => m.userId))])}
      >
        Select {onPlan.length === 1 ? "1 person" : `${onPlan.length} people`}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
        Close
      </Button>
    </div>
  );
}
