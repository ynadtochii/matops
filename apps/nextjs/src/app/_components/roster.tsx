"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import { Button } from "@matops/ui/button";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { EmptyState, ErrorState, SkeletonRows } from "./states";

type Member = RouterOutputs["membership"]["roster"][number];
type MemberHistory = RouterOutputs["membership"]["memberHistory"];
type DriftStatus = MemberHistory["drift"];

/** Weekday labels, 0 = Sun … 6 = Sat — mirrors `@matops/domain` DAY_LABELS. */
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DRIFT_LABEL: Record<DriftStatus, string> = {
  active: "Active",
  cooling: "Cooling",
  at_risk: "At risk",
  dormant: "Dormant",
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
        <h2 className="text-lg font-semibold">Members</h2>
        {active.length === 0 ? (
          <EmptyState title="No active members yet.">
            Approve a pending sign-up, or share an invite link to bring people
            in.
          </EmptyState>
        ) : (
          active.map((m) => (
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
          <ErrorState label="drop-in leads" onRetry={() => void leads.refetch()} />
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
  const [tab, setTab] = useState<"overview" | "attendance">("overview");
  const detail = useQuery(
    trpc.membership.memberHistory.queryOptions({ memberId: m.memberId }),
  );

  return (
    <div className="border-border bg-background rounded-b-lg border border-t-0 p-4">
      <div className="border-border mb-4 flex gap-1 border-b">
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
          Overview
        </TabButton>
        <TabButton
          active={tab === "attendance"}
          onClick={() => setTab("attendance")}
        >
          Attendance
        </TabButton>
      </div>

      {detail.isPending ? (
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
          : "text-muted-foreground border-transparent hover:text-foreground"
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
