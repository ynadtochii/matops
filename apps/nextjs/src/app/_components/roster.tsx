"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import {
  disciplineLabel,
  formatRank,
  RANK_SYSTEMS,
  rankDisciplines,
} from "@matops/domain";
import { Button } from "@matops/ui/button";
import { toast } from "@matops/ui/toast";

import { formatMoney } from "~/lib/money";
import { useTRPC } from "~/trpc/react";
import { EmptyState, ErrorState, SkeletonRows } from "./states";

type Member = RouterOutputs["membership"]["roster"][number];
type MemberHistory = RouterOutputs["membership"]["memberHistory"];
type DriftStatus = MemberHistory["drift"];
type Dues = NonNullable<Member["dues"]>;
type DuesStatus = Dues["status"];

/** Weekday labels, 0 = Sun … 6 = Sat — mirrors `@matops/domain` DAY_LABELS. */
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
    trpc.membership.reject.mutationOptions({ onSuccess: invalidate, onError }),
  );
  const remove = useMutation(
    trpc.membership.remove.mutationOptions({ onSuccess: invalidate, onError }),
  );
  const suspend = useMutation(
    trpc.membership.suspend.mutationOptions({ onSuccess: invalidate, onError }),
  );
  const promote = useMutation(
    trpc.membership.promote.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Promoted to owner");
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
  const busy =
    approve.isPending ||
    reject.isPending ||
    remove.isPending ||
    suspend.isPending ||
    promote.isPending;

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
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Pending approvals
          {pending.length > 0 && (
            <span className="bg-primary text-primary-foreground ml-2 rounded-full px-2 py-0.5 text-xs">
              {pending.length}
            </span>
          )}
        </h2>
        {pending.length === 0 ? (
          <EmptyState title="No one is waiting.">
            New sign-ups land here for you to approve.
          </EmptyState>
        ) : (
          pending.map((m) => (
            <MemberRow key={m.memberId} m={m} label={roleLabel(m)}>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => approve.mutate({ memberId: m.memberId })}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => reject.mutate({ memberId: m.memberId })}
              >
                Reject
              </Button>
            </MemberRow>
          ))
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Members</h2>
          {active.some((m) => m.dues) && (
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
          )}
        </div>
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
                {m.role !== "owner" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => promote.mutate({ memberId: m.memberId })}
                  >
                    Make owner
                  </Button>
                )}
                {m.status === "active" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => suspend.mutate({ memberId: m.memberId })}
                  >
                    Suspend
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={busy}
                  onClick={() => remove.mutate({ memberId: m.memberId })}
                >
                  Remove
                </Button>
              </MemberRow>
              {openId === m.memberId && <MemberDetail m={m} />}
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Drop-in leads</h2>
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
              className="bg-muted flex flex-wrap items-center justify-between gap-3 rounded-lg p-4"
            >
              <div className="flex flex-col">
                <span className="font-medium">
                  {l.firstName} {l.lastName}
                  {l.visitCount > 1 && (
                    <span className="text-muted-foreground ml-2 text-xs uppercase">
                      visited {l.visitCount}×
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground text-sm">
                  {l.phone}
                  {l.email ? ` · ${l.email}` : ""}
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
      className={`bg-muted flex flex-wrap items-center justify-between gap-3 p-4 ${
        open ? "rounded-t-lg" : "rounded-lg"
      }`}
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
      <div className="flex gap-2">{children}</div>
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

  // Keep the belt valid when the discipline changes.
  const onDiscipline = (next: string) => {
    setDiscipline(next);
    setBelt(RANK_SYSTEMS[next]?.belts[0] ?? "");
    setStripes(0);
  };

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
              <li key={r.discipline} className="flex justify-between">
                <span className="text-muted-foreground">
                  {disciplineLabel(r.discipline)}
                </span>
                <span className="font-medium">{formatRank(r)}</span>
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
            <select
              value={discipline}
              onChange={(e) => onDiscipline(e.target.value)}
              className="border-border bg-background rounded-md border px-2 py-1.5 text-sm"
            >
              {systems.map((s) => (
                <option key={s.discipline} value={s.discipline}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Belt</span>
            <select
              value={belt}
              onChange={(e) => setBelt(e.target.value)}
              className="border-border bg-background rounded-md border px-2 py-1.5 text-sm"
            >
              {(system?.belts ?? []).map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          {system && system.maxStripes > 0 && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground text-xs">Stripes</span>
              <select
                value={stripes}
                onChange={(e) => setStripes(Number(e.target.value))}
                className="border-border bg-background rounded-md border px-2 py-1.5 text-sm"
              >
                {Array.from({ length: system.maxStripes + 1 }, (_, i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            size="sm"
            disabled={set.isPending || !belt}
            onClick={() => set.mutate({ memberId, discipline, belt, stripes })}
          >
            Save rank
          </Button>
        </div>
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
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Private note for staff — injuries, goals, readiness…"
          className="border-border bg-background rounded-md border px-3 py-2 text-sm"
        />
        <Button
          size="sm"
          className="self-start"
          disabled={add.isPending || body.trim().length === 0}
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
              className="bg-muted flex flex-col gap-1 rounded-lg p-3 text-sm"
            >
              <p className="whitespace-pre-wrap">{n.body}</p>
              <div className="text-muted-foreground flex items-center justify-between text-xs">
                <span>
                  {n.authorName ?? "Staff"} ·{" "}
                  {dateFmt.format(new Date(n.createdAt))}
                </span>
                <button
                  type="button"
                  onClick={() => remove.mutate({ noteId: n.id })}
                  disabled={remove.isPending}
                  className="text-destructive hover:underline"
                >
                  Delete
                </button>
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
        <Detail term="Email" value={m.email} />
        {m.phone ? <Detail term="Phone" value={m.phone} /> : null}
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

function Detail({ term, value }: { term: string; value: string }) {
  return (
    <div className="border-border flex justify-between border-b py-1.5 last:border-0">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="font-medium">{value}</dd>
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

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-mono text-xl tabular-nums">{value}</p>
      <p className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
        {label}
      </p>
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
