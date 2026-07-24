"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import {
  compareRank,
  disciplineLabel,
  formatRank,
  RANK_SYSTEMS,
  rankDisciplines,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import { Select } from "@matops/ui/select";
import { Spinner } from "@matops/ui/spinner";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";

import { formatMoney } from "~/lib/money";
import { useTRPC } from "~/trpc/react";
import { cardClass, SectionHeading, Stat } from "./primitives";
import { EmptyState, ErrorState, SkeletonRows } from "./states";

type Member = RouterOutputs["membership"]["roster"][number];
type MemberHistory = RouterOutputs["membership"]["memberHistory"];
type DriftStatus = MemberHistory["drift"];
type Dues = NonNullable<Member["dues"]>;
type DuesStatus = Dues["status"];

/** Weekday labels, 0 = Sun … 6 = Sat — mirrors `@matops/domain` DAY_LABELS. */
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Roster row action buttons get a finger-friendly height on mobile, the
 * compact `sm` height on desktop — matches the attendance screen. */
const ROW_BTN = "min-h-11 sm:min-h-8";

const DRIFT_LABEL: Record<DriftStatus, string> = {
  active: "Active",
  cooling: "Cooling",
  at_risk: "At risk",
  dormant: "Dormant",
};

/** Payment status → dot colour + label (spec O7, ADR 40). */
const DUES_TONE: Record<DuesStatus, string> = {
  paid: "bg-success",
  due_soon: "bg-warning",
  overdue: "bg-error",
};
const DUES_LABEL: Record<DuesStatus, string> = {
  paid: "Paid",
  due_soon: "Due soon",
  overdue: "Overdue",
};

const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

function roleLabel(m: Member): string {
  if (m.status === "pending")
    return `wants to join as ${m.invitedRole ?? "student"}`;
  return m.role;
}

export function Roster() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const roster = useQuery(trpc.membership.roster.queryOptions());
  const leads = useQuery(trpc.dropIn.list.queryOptions());

  // A member id from `?member=` (the dashboard "who's drifting" widget links
  // here) opens that member's detail on first render.
  const searchParams = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(
    searchParams.get("member"),
  );
  const toggle = (id: string) =>
    setOpenId((current) => (current === id ? null : id));

  // "Overdue" filter chip on the Members list (spec O7, ADR 40).
  const [overdueOnly, setOverdueOnly] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.membership.roster.pathFilter());

  const onError = (err: { message: string }) =>
    toast.error(err.message || "Action failed");

  const approve = useMutation(
    trpc.membership.approve.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Approved");
      },
      onError,
    }),
  );
  const reject = useMutation(
    trpc.membership.reject.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Request declined");
      },
      onError,
    }),
  );
  const remove = useMutation(
    trpc.membership.remove.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Member removed");
      },
      onError,
    }),
  );
  const suspend = useMutation(
    trpc.membership.suspend.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Member suspended");
      },
      onError,
    }),
  );
  const restore = useMutation(
    trpc.membership.restore.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Member restored");
      },
      onError,
    }),
  );
  const members = roster.data ?? [];
  const pending = members.filter((m) => m.status === "pending");
  const active = members.filter((m) => m.status !== "pending");
  const overdueCount = active.filter(
    (m) => m.dues?.status === "overdue",
  ).length;
  const shownActive = overdueOnly
    ? active.filter((m) => m.dues?.status === "overdue")
    : active;
  // Pending state is scoped to the member being acted on, so approving one
  // person doesn't grey out every other row's buttons.
  const rowBusy = (id: string) =>
    (approve.isPending && approve.variables.memberId === id) ||
    (reject.isPending && reject.variables.memberId === id) ||
    (remove.isPending && remove.variables.memberId === id) ||
    (suspend.isPending && suspend.variables.memberId === id) ||
    (restore.isPending && restore.variables.memberId === id);

  if (roster.isPending) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Members</h2>
        <SkeletonRows rows={4} />
      </section>
    );
  }

  if (roster.isError) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Members</h2>
        <ErrorState label="the roster" onRetry={() => void roster.refetch()} />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <SectionHeading count={pending.length}>Pending approvals</SectionHeading>
        {pending.length === 0 ? (
          <EmptyState title="No one is waiting.">
            New sign-ups land here for you to approve.
          </EmptyState>
        ) : (
          pending.map((m) => {
            const approving =
              approve.isPending && approve.variables.memberId === m.memberId;
            return (
              <MemberRow key={m.memberId} m={m} label={roleLabel(m)}>
                <Button
                  size="sm"
                  className={ROW_BTN}
                  disabled={rowBusy(m.memberId)}
                  onClick={() => approve.mutate({ memberId: m.memberId })}
                >
                  {approving && <Spinner size="sm" className="text-current" />}
                  {approving ? "Approving…" : "Approve"}
                </Button>
                <ConfirmDialog
                  title={`Decline ${m.name}?`}
                  description="They won't join the academy. You can invite them again later with an invite link."
                  confirmLabel="Decline request"
                  variant="destructive"
                  onConfirm={async () => {
                    await reject.mutateAsync({ memberId: m.memberId });
                  }}
                  trigger={
                    <Button
                      size="sm"
                      variant="outline"
                      className={ROW_BTN}
                      disabled={rowBusy(m.memberId)}
                    >
                      Decline
                    </Button>
                  }
                />
              </MemberRow>
            );
          })
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading
          action={
            active.some((m) => m.dues) && (
              <button
                type="button"
                onClick={() => setOverdueOnly((v) => !v)}
                aria-pressed={overdueOnly}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  overdueOnly
                    ? "border-error/40 bg-error/10 text-error"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                Overdue{overdueCount > 0 ? ` (${overdueCount})` : ""}
              </button>
            )
          }
        >
          Members
        </SectionHeading>
        {active.length === 0 ? (
          <EmptyState title="No active members yet.">
            Approve a pending sign-up, or share an invite link to bring people
            in.
          </EmptyState>
        ) : shownActive.length === 0 ? (
          <EmptyState title="No overdue members.">
            Everyone&apos;s dues are up to date.
          </EmptyState>
        ) : (
          shownActive.map((m) => (
            <div key={m.memberId} className="flex flex-col">
              <MemberRow
                m={m}
                label={roleLabel(m)}
                open={openId === m.memberId}
                onToggle={() => toggle(m.memberId)}
              >
                {m.status === "active" && (
                  <ConfirmDialog
                    title={`Suspend ${m.name}?`}
                    description="They keep their place on the roster but can't book classes until you restore them."
                    confirmLabel="Suspend"
                    variant="destructive"
                    onConfirm={async () => {
                      await suspend.mutateAsync({ memberId: m.memberId });
                    }}
                    trigger={
                      <Button
                        size="sm"
                        variant="outline"
                        className={ROW_BTN}
                        disabled={rowBusy(m.memberId)}
                      >
                        Suspend
                      </Button>
                    }
                  />
                )}
                {m.status === "suspended" && (
                  <Button
                    size="sm"
                    className={ROW_BTN}
                    disabled={rowBusy(m.memberId)}
                    onClick={() => restore.mutate({ memberId: m.memberId })}
                  >
                    {restore.isPending &&
                      restore.variables.memberId === m.memberId && (
                        <Spinner size="sm" className="text-current" />
                      )}
                    {restore.isPending &&
                    restore.variables.memberId === m.memberId
                      ? "Restoring…"
                      : "Restore"}
                  </Button>
                )}
                <ConfirmDialog
                  title={`Remove ${m.name}?`}
                  description="They lose access to the academy and drop off the roster. Their attendance history stays. You can invite them again later."
                  confirmLabel="Remove member"
                  variant="destructive"
                  onConfirm={async () => {
                    await remove.mutateAsync({ memberId: m.memberId });
                  }}
                  trigger={
                    <Button
                      size="sm"
                      variant="destructive"
                      className={ROW_BTN}
                      disabled={rowBusy(m.memberId)}
                    >
                      Remove
                    </Button>
                  }
                />
              </MemberRow>
              {openId === m.memberId && <MemberDetail m={m} />}
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeading>Drop-in leads</SectionHeading>
        {leads.isError ? (
          <ErrorState
            label="drop-in leads"
            onRetry={() => void leads.refetch()}
          />
        ) : (leads.data ?? []).length === 0 ? (
          <EmptyState title="No drop-in leads yet.">
            First-time visitors who check in via the gym QR show up here to
            follow up.
          </EmptyState>
        ) : (
          (leads.data ?? []).map((l) => (
            <div
              key={l.id}
              className={cn(
                cardClass(),
                "flex flex-wrap items-center justify-between gap-3",
              )}
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">
                  {l.firstName} {l.lastName}
                  {l.visitCount > 1 && (
                    <span className="text-muted-foreground ml-2 text-xs uppercase">
                      visited {l.visitCount}×
                    </span>
                  )}
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
                      <span>{l.email}</span>
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
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function MemberRow({
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
        {m.dues && <DuesDot dues={m.dues} />}
      </span>
      <span className="text-muted-foreground text-sm">
        {label} · {m.email}
        {m.phone ? ` · ${m.phone}` : ""}
        {m.visitCount > 0 ? ` · attended ${m.visitCount}×` : ""}
      </span>
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
            className={`text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
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
 * present-session history, paginated). Contact/role come from the roster row;
 * `membership.memberHistory` supplies the numbers + list.
 */
function MemberDetail({ m }: { m: Member }) {
  const trpc = useTRPC();
  const [tab, setTab] = useState<"overview" | "attendance" | "rank" | "notes">(
    "overview",
  );
  const detail = useQuery(
    trpc.membership.memberHistory.queryOptions({ memberId: m.memberId }),
  );

  return (
    <div className="border-border bg-background rounded-b-lg border border-t-0 p-4">
      <div className="border-border mb-4 flex gap-1 border-b">
        <TabButton
          active={tab === "overview"}
          onClick={() => setTab("overview")}
        >
          Overview
        </TabButton>
        <TabButton
          active={tab === "attendance"}
          onClick={() => setTab("attendance")}
        >
          Attendance
        </TabButton>
        <TabButton active={tab === "rank"} onClick={() => setTab("rank")}>
          Rank
        </TabButton>
        <TabButton active={tab === "notes"} onClick={() => setTab("notes")}>
          Notes
        </TabButton>
      </div>

      {tab === "rank" ? (
        <RankTab memberId={m.memberId} />
      ) : tab === "notes" ? (
        <NotesTab memberId={m.memberId} />
      ) : detail.isPending ? (
        <SkeletonRows rows={3} />
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
      onError: (err) => toast.error(err.message || "Could not set rank"),
    }),
  );

  const clear = useMutation(
    trpc.rank.clear.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Rank cleared");
      },
      onError: (err) => toast.error(err.message || "Could not clear rank"),
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
          <SkeletonRows rows={1} />
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
                  description="This removes the rank so you can set it fresh — use it to fix a mistake. The promotion history is kept."
                  confirmLabel="Clear rank"
                  onConfirm={async () => {
                    await clear.mutateAsync({
                      memberId,
                      discipline: r.discipline,
                    });
                  }}
                  trigger={
                    <button
                      type="button"
                      disabled={clear.isPending}
                      className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline underline-offset-2 disabled:opacity-50"
                    >
                      Clear
                    </button>
                  }
                />
              </li>
            ))}
          </ul>
        )}
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
            disabled={set.isPending || !belt || wouldRegress}
            onClick={() => set.mutate({ memberId, discipline, belt, stripes })}
          >
            {set.isPending && <Spinner size="sm" className="text-current" />}
            {set.isPending ? "Saving…" : "Save rank"}
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
    toast.error(err.message || "Action failed");

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
          placeholder="Private note for staff — injuries, goals, readiness…"
        />
        <Button
          size="sm"
          className="self-start"
          disabled={add.isPending || body.trim().length === 0}
          onClick={() => add.mutate({ memberId, body: body.trim() })}
        >
          {add.isPending && <Spinner size="sm" className="text-current" />}
          {add.isPending ? "Adding…" : "Add note"}
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
                    <button
                      type="button"
                      disabled={
                        remove.isPending && remove.variables.noteId === n.id
                      }
                      className="text-destructive font-medium hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
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

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-brand text-foreground"
          : "text-muted-foreground hover:text-foreground border-transparent"
      }`}
    >
      {children}
    </button>
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
        <Detail term="Email" value={m.email} copy={m.email} />
        {m.phone ? <Detail term="Phone" value={m.phone} copy={m.phone} /> : null}
        {favorite ? <Detail term="Favorite" value={favorite} /> : null}
        {m.dues ? (
          <>
            <Detail
              term="Plan"
              value={`${m.dues.planName} · ${formatMoney(m.dues.priceMinor, m.dues.currency)}`}
            />
            <Detail
              term="Next due"
              value={`${dateFmt.format(new Date(m.dues.nextDueAt))} · ${DUES_LABEL[m.dues.status]}`}
            />
            {m.dues.lastConfirmedAt ? (
              <Detail
                term="Last payment"
                value={dateFmt.format(new Date(m.dues.lastConfirmedAt))}
              />
            ) : null}
          </>
        ) : null}
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
            className="size-6 shrink-0"
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
        <button
          type="button"
          onClick={() => setLimit((n) => n + 15)}
          className="text-brand-strong mt-2 self-start text-sm font-medium"
        >
          Show more ({history.length - limit})
        </button>
      )}
    </div>
  );
}

/** A small payment-status dot + label next to a member's name (spec O7). */
function DuesDot({ dues }: { dues: Dues }) {
  return (
    <span
      className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-normal"
      title={`${DUES_LABEL[dues.status]} · ${formatMoney(dues.priceMinor, dues.currency)}`}
    >
      <span
        className={`inline-block size-2 rounded-full ${DUES_TONE[dues.status]}`}
        aria-hidden
      />
      <span className="text-muted-foreground">{DUES_LABEL[dues.status]}</span>
    </span>
  );
}

function DriftBadge({ drift }: { drift: DriftStatus }) {
  const tone =
    drift === "dormant"
      ? "text-error border-error/40"
      : drift === "at_risk"
        ? "text-warning border-warning/40"
        : drift === "cooling"
          ? "text-muted-foreground border-border"
          : "text-success border-success/40";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {DRIFT_LABEL[drift]}
    </span>
  );
}
