"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  compareRank,
  DAY_LABELS,
  disciplineLabel,
  formatMoney,
  formatRank,
  isStaffRole,
  RANK_SYSTEMS,
  rankDisciplines,
  runsBranch,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import { Input } from "@matops/ui/input";
import { Select } from "@matops/ui/select";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";

import type { Member, MemberHistory } from "./members";
import { dateFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useEntity, useOrganization } from "./entity";
import { cardClass, DriftBadge, RESOLVE, Stat, TAP } from "./primitives";
import { SkeletonLines, SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";
import { Tabs } from "./tabs";

/**
 * One member's row and the detail panel behind it (spec O4): Overview, Rank,
 * Notes and Attendance. Split out of `members.tsx`, which keeps the list and
 * its three tabs.
 */

/** The short tag on a member whose access is not clear, in the roster's words. */
const MEMBERSHIP_TAG: Record<string, string> = {
  expired: "month unpaid",
  "not-covered": "no membership",
  "pending-approval": "awaiting approval",
  suspended: "suspended",
};

export function MemberRow({
  m,
  label,
  children,
  open,
  onToggle,
}: {
  m: Member;
  label: string;
  children: React.ReactNode;
  /** When present, the name becomes a toggle for the detail panel (C.2). */
  open?: boolean;
  onToggle?: () => void;
}) {
  const name = (
    <>
      <span className="font-medium">
        {m.name}
        {m.status === "suspended" && (
          <span className="text-muted-foreground ml-2 text-xs uppercase">
            suspended
          </span>
        )}
        {!isStaffRole(m) && m.membership && m.membership.verdict !== "ok" && (
          <span className="text-error ml-2 text-xs font-medium uppercase">
            {MEMBERSHIP_TAG[m.membership.verdict]}
          </span>
        )}
      </span>
      <span className="text-muted-foreground text-sm">
        {label} · {m.email}
        {m.phone ? ` · ${m.phone}` : ""}
        {m.visitCount > 0 ? ` · attended ${m.visitCount}×` : ""}
      </span>
      {/* Why they are on THIS branch's roster. Somebody whose plan covers the
          gym is a member of the gym, not a visitor (ADR 126). */}
      {isStaffRole(m) && m.status === "active" && (
        <span className="text-muted-foreground text-sm">
          Staff access. No membership required
        </span>
      )}
      {!isStaffRole(m) && m.membership?.covered && (
        <span className="text-muted-foreground text-sm">
          Covered by {m.membership.planNames.join(", ")}
        </span>
      )}
      {!isStaffRole(m) && m.membership && !m.membership.covered && (
        <span className="text-muted-foreground text-sm">
          Joined this branch, no membership covers it
        </span>
      )}
    </>
  );
  return (
    <div
      className={cn(
        cardClass(),
        "flex flex-wrap items-center justify-between gap-3",
        open && "rounded-b-none",
      )}
    >
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <span
            className={cn(
              "text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-90",
            )}
            aria-hidden
          >
            ›
          </span>
          <span className="flex flex-col">{name}</span>
        </button>
      ) : (
        <div className="flex flex-col">{name}</div>
      )}
      <div className="flex flex-wrap justify-end gap-2">{children}</div>
    </div>
  );
}

/**
 * Expanded member detail (spec O4, slice C.2 — ADR 39). Two tabs: Overview
 * (contact + role + attendance stats + drift band) and Attendance (the full
 * present-session history, paginated). Contact/role come from the member row;
 * `membership.memberHistory` supplies the numbers + list.
 */
export function MemberDetail({ m }: { m: Member }) {
  const trpc = useTRPC();
  // Memberships belong to the owner group, so only an owner sees the tab. A
  // coach reading eligibility for their own branch is a different screen.
  const owner = runsBranch(useEntity());
  const [tab, setTab] = useState<
    "overview" | "attendance" | "rank" | "notes" | "membership"
  >("overview");
  const detail = useQuery(
    trpc.membership.memberHistory.queryOptions({ memberId: m.memberId }),
  );

  return (
    <div
      className={cn(
        "border-border bg-background rounded-b-lg border border-t-0 p-4",
        RESOLVE,
      )}
    >
      <Tabs
        label={`${m.name} detail`}
        value={tab}
        onChange={setTab}
        className="mb-4"
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "attendance", label: "Attendance" },
          { id: "rank", label: "Rank" },
          { id: "notes", label: "Notes" },
          ...(owner && !isStaffRole(m)
            ? [{ id: "membership" as const, label: "Membership" }]
            : []),
        ]}
      />

      <div key={tab} className={RESOLVE}>
        {tab === "rank" ? (
          <RankTab memberId={m.memberId} />
        ) : tab === "notes" ? (
          <NotesTab memberId={m.memberId} />
        ) : tab === "membership" ? (
          <MembershipTab personId={m.personId} name={m.name} />
        ) : detail.isPending ? (
          <SkeletonLines n={5} />
        ) : detail.isError ? (
          <ErrorState
            label="member detail"
            onRetry={() => void detail.refetch()}
          />
        ) : tab === "overview" ? (
          <Overview m={m} data={detail.data} />
        ) : (
          <AttendanceHistory history={detail.data.history} />
        )}
      </div>
    </div>
  );
}

/**
 * Membership tab (ADR 126). What this person's shared memberships cover, and
 * how to give them another.
 *
 * The assignment is held once for the whole organization, so what is shown here
 * is the same record an owner would see standing in any other branch. Assigning
 * from here records THIS branch as where it happened, which is bookkeeping and
 * never a limit on what the plan covers.
 */
function MembershipTab({ personId, name }: { personId: string; name: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { entities } = useOrganization();
  const here = useEntity().academyId;
  const [picked, setPicked] = useState("");
  const [outcome, setOutcome] = useState<{
    enrolled: string[];
    needsDecision: { entityId: string; status: string }[];
  } | null>(null);

  const held = useQuery(trpc.accessPlan.forUser.queryOptions({ personId }));
  const plans = useQuery(trpc.accessPlan.list.queryOptions());
  const nameOf = (id: string) =>
    entities.find((e) => e.id === id)?.name ?? "a closed branch";

  const assign = useMutation(
    trpc.accessPlan.assign.mutationOptions({
      onSuccess: async (made) => {
        await queryClient.invalidateQueries(
          trpc.accessPlan.forUser.pathFilter(),
        );
        setPicked("");
        setOutcome({
          enrolled: made.enrolled,
          needsDecision: made.needsDecision,
        });
        toast.success(
          made.created
            ? "Membership added"
            : made.restored
              ? "Membership restored"
              : `${name} already has that one`,
        );
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't assign that. Try again."),
    }),
  );

  const end = useMutation(
    trpc.accessPlan.cancel.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries(trpc.accessPlan.forUser.pathFilter()),
      onError: (e) => toast.error(e.message),
    }),
  );
  const pause = useMutation(
    trpc.accessPlan.suspend.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries(trpc.accessPlan.forUser.pathFilter()),
      onError: (e) => toast.error(e.message),
    }),
  );
  const mark = useMutation(
    trpc.accessPlan.markMonth.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries(trpc.accessPlan.forUser.pathFilter()),
      onError: (e) =>
        toast.error(e.message || "Couldn't record that. Try again."),
    }),
  );

  if (held.isPending) return <SkeletonRows rows={2} />;
  if (held.isError) {
    return (
      <ErrorState
        label="their memberships"
        onRetry={() => void held.refetch()}
      />
    );
  }

  const offerable = (plans.data ?? []).filter(
    (p) => !p.archived && !held.data.some((h) => h.planId === p.id),
  );
  return (
    <div className="flex flex-col gap-4">
      {held.data.length === 0 ? (
        <EmptyState title={`${name} holds no membership yet.`}>
          Give them one below. It covers every branch the plan names.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {held.data.map((h) => (
            <li key={h.id} className={cn(cardClass(), "flex flex-wrap gap-3")}>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-medium">
                  {h.planName}
                  {h.status !== "active" && (
                    <span className="text-muted-foreground ml-2 text-xs uppercase">
                      {h.status}
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground text-sm">
                  {h.entityIds.length === 0
                    ? "Covers no branch"
                    : h.entityIds.map(nameOf).join(" · ")}
                </span>
                <span className="text-muted-foreground text-xs">
                  From {h.startMonth}
                  {h.assigningEntityId
                    ? ` · added at ${nameOf(h.assigningEntityId)}`
                    : ""}
                </span>
                {h.status === "active" && h.month && (
                  <span className="text-muted-foreground text-xs">
                    {h.monthLabel}
                    {h.amount
                      ? ` · ${formatMoney(h.amount.priceMinor, h.amount.currency)}`
                      : ""}{" "}
                    · {h.paid ? "paid" : "not paid yet"}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-start justify-end gap-2">
                {h.status === "active" && h.month && (
                  <Button
                    size="sm"
                    variant={h.paid ? "outline" : "secondary"}
                    busy={
                      mark.isPending && mark.variables.assignmentId === h.id
                    }
                    onClick={() => {
                      if (h.month) {
                        mark.mutate({
                          assignmentId: h.id,
                          month: h.month,
                          paid: !h.paid,
                        });
                      }
                    }}
                  >
                    {h.paid ? "Undo paid" : "Mark paid"}
                  </Button>
                )}
                {h.status === "active" && (
                  <Button
                    size="sm"
                    variant="outline"
                    busy={pause.isPending && pause.variables.id === h.id}
                    onClick={() => pause.mutate({ id: h.id })}
                  >
                    Pause
                  </Button>
                )}
                {h.status !== "cancelled" && (
                  <ConfirmDialog
                    title="End this membership?"
                    description="It stops covering every branch it covers. Their branch memberships, history and bookings all stay."
                    confirmLabel="End it"
                    onConfirm={async () => {
                      await end.mutateAsync({ id: h.id });
                    }}
                    trigger={
                      <Button size="sm" variant="destructive-outline">
                        End
                      </Button>
                    }
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {outcome && (
        <div className="flex flex-col gap-1 text-sm">
          {outcome.enrolled.length > 0 && (
            <p>Added them at {outcome.enrolled.map(nameOf).join(", ")}.</p>
          )}
          {outcome.needsDecision.map((d) => (
            <p key={d.entityId} className="text-brand-strong">
              Their membership at {nameOf(d.entityId)} is {d.status}. Nothing
              here changed it, so decide about that branch on its own.
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <label
            htmlFor={`assign-${personId}`}
            className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase"
          >
            Give a membership
          </label>
          <Select
            id={`assign-${personId}`}
            value={picked}
            disabled={assign.isPending || offerable.length === 0}
            onChange={(e) => setPicked(e.target.value)}
          >
            <option value="">
              {offerable.length === 0
                ? "No other plan to give"
                : "Pick a plan…"}
            </option>
            {offerable.map((p) => (
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
          variant="secondary"
          busy={assign.isPending}
          disabled={picked === ""}
          onClick={() =>
            assign.mutate({
              personId,
              planId: picked,
              assigningEntityId: here,
            })
          }
        >
          Add
        </Button>
      </div>
    </div>
  );
}

/**
 * Rank tab (spec O4, slice G.2 — ADR 41). The coach sets a member's rank per
 * discipline (belt + stripes, validated against the seeded system) and sees the
 * promotion history. NO automation — this is the coach's own judgment.
 */
function RankTab({ memberId }: { memberId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const ranks = useQuery(trpc.rank.forMember.queryOptions({ memberId }));

  const systems = rankDisciplines();
  const [discipline, setDiscipline] = useState(systems[0]?.discipline ?? "bjj");
  const system = RANK_SYSTEMS[discipline];
  const [belt, setBelt] = useState(system?.belts[0] ?? "");
  const [stripes, setStripes] = useState(0);
  const [correctionReason, setCorrectionReason] = useState("");

  // The member's current rank in the selected discipline (rank only goes up).
  const current = ranks.data?.ranks.find((r) => r.discipline === discipline);
  const wouldRegress =
    !!current && compareRank(discipline, { belt, stripes }, current) < 0;

  // Seed the form to the current rank so the natural next action is a bump, not
  // an accidental demotion (the API refuses those anyway). This runs during
  // render — the React-recommended way to reset state when a value changes —
  // re-seeding whenever the discipline switches or the member's rank loads /
  // changes (never mid-edit, since the seed key only moves when `current` does).
  const seedKey = ranks.data
    ? `${discipline}:${current ? `${current.belt}/${current.stripes}` : "none"}`
    : null;
  const [seededKey, setSeededKey] = useState<string | null>(null);
  if (seedKey && seedKey !== seededKey) {
    setSeededKey(seedKey);
    setBelt(current?.belt ?? system?.belts[0] ?? "");
    setStripes(current?.stripes ?? 0);
  }

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.rank.forMember.pathFilter());

  const set = useMutation(
    trpc.rank.set.mutationOptions({
      onSuccess: async (r) => {
        await invalidate();
        toast.success(r.changed ? "Rank updated" : "No change");
      },
      onError: (err) =>
        toast.error(err.message || "Couldn't set rank. Try again."),
    }),
  );

  const clear = useMutation(
    trpc.rank.clear.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Rank cleared");
      },
      onError: (err) =>
        toast.error(err.message || "Couldn't clear rank. Try again."),
    }),
  );

  const onDiscipline = (next: string) => setDiscipline(next);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Current rank
        </span>
        {ranks.isPending ? (
          <SkeletonLines n={2} />
        ) : ranks.isError ? (
          <ErrorState label="rank" onRetry={() => void ranks.refetch()} />
        ) : ranks.data.ranks.length === 0 ? (
          <p className="text-muted-foreground text-sm">No rank set yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {ranks.data.ranks.map((r) => (
              <li key={r.discipline} className="flex items-center gap-3">
                <span className="text-muted-foreground">
                  {disciplineLabel(r.discipline)}
                </span>
                <span className="ml-auto font-medium">{formatRank(r)}</span>
                <ConfirmDialog
                  title={`Clear ${disciplineLabel(r.discipline)} rank?`}
                  description="This removes the rank so you can set it fresh. Use it to fix a mistake. The promotion history is kept."
                  confirmLabel="Clear rank"
                  onConfirm={async () => {
                    await clear.mutateAsync({
                      memberId,
                      discipline: r.discipline,
                      reason: correctionReason,
                    });
                  }}
                  trigger={
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive-outline"
                      disabled={clear.isPending || !correctionReason.trim()}
                    >
                      Clear
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {ranks.data?.ranks.length ? (
          <Input
            value={correctionReason}
            onChange={(event) => setCorrectionReason(event.target.value)}
            placeholder="Reason required to clear a rank"
          />
        ) : null}
      </div>

      <div className="border-border flex flex-col gap-3 border-t pt-4">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Set rank
        </span>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Discipline</span>
            <Select
              value={discipline}
              onChange={(e) => onDiscipline(e.target.value)}
            >
              {systems.map((s) => (
                <option key={s.discipline} value={s.discipline}>
                  {s.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Belt</span>
            <Select value={belt} onChange={(e) => setBelt(e.target.value)}>
              {(system?.belts ?? []).map((b) => (
                <option
                  key={b}
                  value={b}
                  disabled={
                    !!current &&
                    !!system &&
                    compareRank(
                      discipline,
                      { belt: b, stripes: system.maxStripes },
                      current,
                    ) < 0
                  }
                >
                  {b}
                </option>
              ))}
            </Select>
          </label>
          {system && system.maxStripes > 0 && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground text-xs">Stripes</span>
              <Select
                value={stripes}
                onChange={(e) => setStripes(Number(e.target.value))}
              >
                {Array.from({ length: system.maxStripes + 1 }, (_, i) => (
                  <option
                    key={i}
                    value={i}
                    disabled={
                      !!current &&
                      compareRank(discipline, { belt, stripes: i }, current) < 0
                    }
                  >
                    {i}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <Button
            size="sm"
            variant="secondary"
            busy={set.isPending}
            disabled={!belt || wouldRegress}
            onClick={() => set.mutate({ memberId, discipline, belt, stripes })}
          >
            Save rank
          </Button>
        </div>
        {current && (
          <p className="text-muted-foreground text-xs">
            Rank only goes up. To fix a mistake, clear it first, then set it
            again.
          </p>
        )}
      </div>

      {ranks.data && ranks.data.history.length > 0 && (
        <div className="border-border flex flex-col gap-2 border-t pt-4">
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Promotion history
          </span>
          {ranks.data.history.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="font-medium">
                {disciplineLabel(h.discipline)} ·{" "}
                {formatRank({
                  discipline: h.discipline,
                  belt: h.toBelt,
                  stripes: h.toStripes,
                })}
              </span>
              <span className="text-muted-foreground shrink-0">
                {dateFmt.format(new Date(h.promotedAt))} · {h.promotedByName}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Notes tab (spec O4, slice G.4 — ADR 41). Staff-private coaching notes about the
 * member. Every staff member at the academy shares them; the member never sees
 * them.
 */
function NotesTab({ memberId }: { memberId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const notes = useQuery(trpc.note.forMember.queryOptions({ memberId }));
  const [body, setBody] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.note.forMember.pathFilter());
  const onError = (err: { message: string }) =>
    toast.error(
      err.message ||
        "Couldn't finish that. Check your connection and try again.",
    );

  const add = useMutation(
    trpc.note.add.mutationOptions({
      onSuccess: async () => {
        setBody("");
        await invalidate();
      },
      onError,
    }),
  );
  const remove = useMutation(
    trpc.note.remove.mutationOptions({ onSuccess: invalidate, onError }),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          maxLength={2000}
          aria-label="New staff note"
          placeholder="Private note for staff: injuries, goals, readiness…"
        />
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          busy={add.isPending}
          disabled={body.trim().length === 0}
          onClick={() => add.mutate({ memberId, body: body.trim() })}
        >
          Add note
        </Button>
      </div>

      {notes.isPending ? (
        <SkeletonRows rows={2} />
      ) : notes.isError ? (
        <ErrorState label="notes" onRetry={() => void notes.refetch()} />
      ) : notes.data.length === 0 ? (
        <EmptyState title="No notes yet.">
          Staff-only. Jot injuries, goals, or anything the next coach should
          know.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {notes.data.map((n) => (
            <div
              key={n.id}
              className={cn(cardClass(), "flex flex-col gap-1 p-3 text-sm")}
            >
              <p className="whitespace-pre-wrap">{n.body}</p>
              <div className="text-muted-foreground flex items-center justify-between text-xs">
                <span>
                  {n.authorName ?? "Staff"} ·{" "}
                  {dateFmt.format(new Date(n.createdAt))}
                </span>
                <ConfirmDialog
                  title="Delete this note?"
                  description="It's removed for all staff. This can't be undone."
                  confirmLabel="Delete note"
                  variant="destructive"
                  onConfirm={async () => {
                    await remove.mutateAsync({ noteId: n.id });
                  }}
                  trigger={
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive-outline"
                      disabled={
                        remove.isPending && remove.variables.noteId === n.id
                      }
                    >
                      Delete
                    </Button>
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Overview({ m, data }: { m: Member; data: MemberHistory }) {
  const s = data.stats;
  const favorite = [
    s.favoriteDiscipline?.toUpperCase(),
    s.favoriteWeekday != null ? DAY_LABELS[s.favoriteWeekday] : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <DriftBadge drift={data.drift} />
        <span className="text-muted-foreground">
          {data.lastAttendance
            ? `Last trained ${dateFmt.format(new Date(data.lastAttendance))}`
            : "No attended sessions yet"}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <Stat value={s.total} label="Sessions" />
        <Stat value={s.thisMonth} label="This month" />
        <Stat value={s.streakWeeks} label="Week streak" />
      </div>

      <dl className="text-sm">
        <Detail term="Role" value={m.role} />
        <Detail
          term="Email"
          value={m.email ?? "No email"}
          copy={m.email ?? undefined}
        />
        {m.phone ? (
          <Detail term="Phone" value={m.phone} copy={m.phone} />
        ) : null}
        {favorite ? <Detail term="Favorite" value={favorite} /> : null}
        <Detail term="Joined" value={dateFmt.format(new Date(m.joinedAt))} />
      </dl>
    </div>
  );
}

function Detail({
  term,
  value,
  copy,
}: {
  term: string;
  value: string;
  copy?: string;
}) {
  return (
    <div className="border-border flex items-center justify-between gap-2 border-b py-1.5 last:border-0">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="flex items-center gap-1 font-medium">
        <span className="break-all">{value}</span>
        {copy && (
          <CopyButton
            value={copy}
            iconOnly
            variant="ghost"
            label={`Copy ${term.toLowerCase()}`}
            toastMessage={`${term} copied`}
            className={cn(TAP, "shrink-0")}
          />
        )}
      </dd>
    </div>
  );
}

function AttendanceHistory({ history }: { history: MemberHistory["history"] }) {
  const [limit, setLimit] = useState(15);
  if (history.length === 0) {
    return (
      <EmptyState title="No attended sessions yet.">
        Once this member is marked present at a class, it shows up here.
      </EmptyState>
    );
  }
  const shown = history.slice(0, limit);
  return (
    <div className="flex flex-col gap-1">
      {shown.map((h) => (
        <div
          key={h.classId}
          className="border-border flex items-center justify-between gap-3 border-b py-2 text-sm last:border-0"
        >
          <span className="font-medium">{h.title}</span>
          <span className="text-muted-foreground shrink-0">
            {dateFmt.format(new Date(h.startsAt))}
          </span>
        </div>
      ))}
      {history.length > limit && (
        <Button
          type="button"
          size="sm"
          variant="link"
          className="mt-2 self-start px-0"
          onClick={() => setLimit((n) => n + 15)}
        >
          Show more ({history.length - limit})
        </Button>
      )}
    </div>
  );
}

/** A small payment-status dot + label next to a member's name (spec O7). */
