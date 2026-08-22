"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import { groupMoneyByCurrency } from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@matops/ui/dialog";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { toast } from "@matops/ui/toast";

import { formatMoney } from "~/lib/money";
import { useTRPC } from "~/trpc/react";
import { PageHeader } from "./page-header";
import { cardClass, Eyebrow, SectionHeading } from "./primitives";
import { EmptyState, ErrorState, SkeletonRows } from "./states";

type Dashboard = RouterOutputs["referral"]["dashboard"];
type Student = Dashboard["students"][number];
type Referrer = Dashboard["referrers"][number];
type Money = Student["lifetimeRevenue"][number];

interface BoardEntry {
  memberId: string;
  name: string;
  role: string;
  students: Student[];
  monthRevenue: Money[];
  lifetimeRevenue: Money[];
}

const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const CLEAR = "__clear__";

function moneyText(amounts: Money[]): string {
  if (amounts.length === 0) return "—";
  return amounts.map((a) => formatMoney(a.amountMinor, a.currency)).join(" · ");
}

function Num({ children }: { children: ReactNode }) {
  return (
    <span className="text-foreground font-mono tabular-nums">{children}</span>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        status === "active" && "bg-success",
        status === "pending" && "bg-warning",
        status === "suspended" && "bg-error",
        status === "removed" && "bg-muted-foreground/50",
      )}
    />
  );
}

function PersonLabel({ student }: { student: Student }) {
  return (
    <>
      <StatusDot status={student.status} />
      <span className="truncate">{student.name}</span>
      {student.status !== "active" && (
        <span className="text-muted-foreground shrink-0 text-xs">
          {student.status}
        </span>
      )}
    </>
  );
}

/**
 * Owner referral screen (O9, ADR 52 + 56). Reads referrer-first: who brings
 * people in, and who is still uncredited. One dialog owns every write.
 */
export function ReferralsScreen() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const dashboard = useQuery(trpc.referral.dashboard.queryOptions());
  const [search, setSearch] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const [editing, setEditing] = useState<{ studentId: string } | null>(null);

  const data = dashboard.data;

  const visible = useMemo(
    () => (data?.students ?? []).filter((s) => showRemoved || !s.removed),
    [data, showRemoved],
  );

  const board = useMemo(() => {
    const groups = new Map<string, BoardEntry>();
    for (const student of visible) {
      if (!student.referrer) continue;
      const person = student.referrer;
      const entry = groups.get(person.memberId) ?? {
        memberId: person.memberId,
        name: person.name,
        role:
          data?.referrers.find((r) => r.memberId === person.memberId)?.role ??
          "",
        students: [],
        monthRevenue: [],
        lifetimeRevenue: [],
      };
      entry.students.push(student);
      groups.set(person.memberId, entry);
    }
    return [...groups.values()]
      .map((entry) => ({
        ...entry,
        students: [...entry.students].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
        monthRevenue: groupMoneyByCurrency(
          entry.students.flatMap((s) => s.monthRevenue),
        ),
        lifetimeRevenue: groupMoneyByCurrency(
          entry.students.flatMap((s) => s.lifetimeRevenue),
        ),
      }))
      .sort(
        (a, b) =>
          b.students.length - a.students.length || a.name.localeCompare(b.name),
      );
  }, [data, visible]);

  const uncredited = useMemo(
    () => visible.filter((s) => !s.referrer),
    [visible],
  );

  const term = search.trim().toLocaleLowerCase();
  const matches = (name: string) => name.toLocaleLowerCase().includes(term);
  const shownBoard = term
    ? board.filter(
        (entry) =>
          matches(entry.name) || entry.students.some((s) => matches(s.name)),
      )
    : board;
  const shownUncredited = term
    ? uncredited.filter((s) => matches(s.name))
    : uncredited;

  return (
    <>
      <PageHeader
        title="Referrals"
        subtitle="Who brings new students to the gym."
        action={
          data && (
            <Button onClick={() => setEditing({ studentId: "" })}>
              Record a referral
            </Button>
          )
        }
      />
      {dashboard.isError ? (
        <ErrorState
          label="referrals"
          onRetry={() => void dashboard.refetch()}
        />
      ) : !data ? (
        <SkeletonRows rows={6} />
      ) : (
        <div className="flex flex-col gap-8">
          <Summary
            board={board}
            credited={visible.length - uncredited.length}
          />

          {(board.length > 0 || uncredited.length > 0) && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1 basis-56">
                <Label htmlFor="referral-search" className="sr-only">
                  Find a person
                </Label>
                <Input
                  id="referral-search"
                  type="search"
                  value={search}
                  placeholder="Find a person…"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <label className="text-muted-foreground flex shrink-0 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showRemoved}
                  onChange={(event) => setShowRemoved(event.target.checked)}
                  className="accent-brand size-4"
                />
                Show removed students
              </label>
            </div>
          )}

          <section className="space-y-3">
            <SectionHeading>Credited</SectionHeading>
            {shownBoard.length === 0 ? (
              <EmptyState
                title={
                  board.length === 0
                    ? "No referrals recorded yet."
                    : "Nobody matches that search."
                }
                action={
                  board.length === 0 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditing({ studentId: "" })}
                    >
                      Record a referral
                    </Button>
                  )
                }
              >
                {board.length === 0 &&
                  "Record who brought a student in, and their students show up here."}
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {shownBoard.map((entry) => (
                  <ReferrerCard
                    key={entry.memberId}
                    entry={entry}
                    onEdit={(studentId) => setEditing({ studentId })}
                  />
                ))}
              </ul>
            )}
          </section>

          {uncredited.length > 0 && (
            <section className="space-y-3">
              <SectionHeading count={uncredited.length}>
                Nobody credited yet
              </SectionHeading>
              {shownUncredited.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nobody matches that search.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {shownUncredited.map((student) => {
                    const cleared = student.assignmentState === "cleared";
                    const rowClass = cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left text-sm",
                    );
                    const hint = cleared
                      ? "credit removed · record again"
                      : "who brought them?";
                    return (
                      <li key={student.memberId}>
                        <button
                          type="button"
                          onClick={() =>
                            setEditing({ studentId: student.memberId })
                          }
                          className={cn(
                            cardClass({
                              variant: "outline",
                              interactive: true,
                            }),
                            rowClass,
                          )}
                        >
                          <PersonLabel student={student} />
                          <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                            {hint}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      {editing && data && (
        <ReferralDialog
          key={editing.studentId || "new"}
          data={data}
          initialStudentId={editing.studentId}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await queryClient.invalidateQueries(
              trpc.referral.dashboard.pathFilter(),
            );
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function Summary({
  board,
  credited,
}: {
  board: BoardEntry[];
  credited: number;
}) {
  if (board.length === 0) return null;
  const month = groupMoneyByCurrency(board.flatMap((e) => e.monthRevenue));
  const lifetime = groupMoneyByCurrency(
    board.flatMap((e) => e.lifetimeRevenue),
  );
  return (
    <p className="text-muted-foreground max-w-2xl text-lg leading-relaxed">
      <Num>{board.length}</Num>{" "}
      {board.length === 1 ? "member has" : "members have"} brought{" "}
      <Num>{credited}</Num> {credited === 1 ? "student" : "students"} in. Those
      students have paid <Num>{moneyText(month)}</Num> this month,{" "}
      <Num>{moneyText(lifetime)}</Num> in total.
    </p>
  );
}

function ReferrerCard({
  entry,
  onEdit,
}: {
  entry: BoardEntry;
  onEdit: (studentId: string) => void;
}) {
  return (
    <li className={cn(cardClass(), "flex gap-4")}>
      <div className="w-12 shrink-0">
        <p className="font-mono text-2xl leading-none tabular-nums">
          {entry.students.length}
        </p>
        <Eyebrow className="mt-1">
          {entry.students.length === 1 ? "student" : "students"}
        </Eyebrow>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-medium">{entry.name}</span>
          {entry.role && (
            <span className="text-muted-foreground text-xs">{entry.role}</span>
          )}
          <span className="text-muted-foreground ml-auto font-mono text-xs tabular-nums">
            {moneyText(entry.monthRevenue)} this month ·{" "}
            {moneyText(entry.lifetimeRevenue)} total
          </span>
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {entry.students.map((student) => (
            <li key={student.memberId}>
              <button
                type="button"
                onClick={() => onEdit(student.memberId)}
                title={`Change who brought ${student.name} in`}
                className="border-border hover:border-brand/40 hover:bg-muted flex max-w-52 items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors"
              >
                <PersonLabel student={student} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

function ReferralDialog({
  data,
  initialStudentId,
  onClose,
  onSaved,
}: {
  data: Dashboard;
  initialStudentId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const trpc = useTRPC();
  const [studentId, setStudentId] = useState(initialStudentId);
  const [referrerId, setReferrerId] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const onError = (error: { message: string }) =>
    toast.error(error.message || "Could not save the referral");
  const assign = useMutation(
    trpc.referral.assign.mutationOptions({
      onSuccess: async () => {
        await onSaved();
        toast.success("Referral recorded");
      },
      onError,
    }),
  );
  const correct = useMutation(
    trpc.referral.correct.mutationOptions({
      onSuccess: async () => {
        await onSaved();
        toast.success("Referral updated");
      },
      onError,
    }),
  );

  const student = data.students.find((s) => s.memberId === studentId);
  const isNew = !student || student.assignmentState === "never_assigned";
  const clearing = referrerId === CLEAR;
  const pending = assign.isPending || correct.isPending;

  const choosable = data.students
    .filter((s) => !s.removed || s.memberId === initialStudentId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const unrecorded = choosable.filter(
    (s) => s.assignmentState === "never_assigned",
  );
  const recorded = choosable.filter(
    (s) => s.assignmentState !== "never_assigned",
  );
  const people: Referrer[] = data.referrers.filter(
    (person) => person.memberId !== studentId,
  );

  const save = () => {
    if (!studentId || !referrerId) return;
    if (isNew) {
      assign.mutate({
        studentMemberId: studentId,
        referrerMemberId: referrerId,
      });
      return;
    }
    correct.mutate({
      studentMemberId: studentId,
      referrerMemberId: clearing ? null : referrerId,
    });
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogTitle>
          {isNew
            ? "Record a referral"
            : `Change who brought ${student.name} in`}
        </DialogTitle>
        <DialogDescription>
          {!student || isNew
            ? "Pick the student and the member who brought them in."
            : student.referrer
              ? `Currently credited to ${student.referrer.name}.`
              : "The credit for this student was removed earlier."}
        </DialogDescription>
        <div className="space-y-4">
          {initialStudentId ? (
            <div>
              <Eyebrow>Student</Eyebrow>
              <p className="mt-1 text-sm font-medium">
                {student?.name ?? "Unknown member"}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="referral-student">Student</Label>
              <Select
                id="referral-student"
                className="w-full"
                value={studentId}
                onChange={(event) => {
                  setStudentId(event.target.value);
                  setReferrerId("");
                }}
              >
                <option value="">Choose a student…</option>
                {unrecorded.length > 0 && (
                  <optgroup label="Nobody credited yet">
                    {unrecorded.map((s) => (
                      <option key={s.memberId} value={s.memberId}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {recorded.length > 0 && (
                  <optgroup label="Already recorded">
                    {recorded.map((s) => (
                      <option key={s.memberId} value={s.memberId}>
                        {s.name}
                        {s.referrer
                          ? ` · brought in by ${s.referrer.name}`
                          : " · credit removed"}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="referral-referrer">Brought in by</Label>
            <Select
              id="referral-referrer"
              className="w-full"
              disabled={!studentId}
              value={referrerId}
              onChange={(event) => setReferrerId(event.target.value)}
            >
              <option value="">Choose a member…</option>
              {people.map((person) => (
                <option key={person.memberId} value={person.memberId}>
                  {person.name} · {person.role}
                  {person.status !== "active" ? ` · ${person.status}` : ""}
                </option>
              ))}
              {student?.referrer && (
                <option value={CLEAR}>Remove the credit</option>
              )}
            </Select>
          </div>

          <p className="text-muted-foreground text-sm">
            {isNew
              ? "Recorded once. After that, only an owner can change it."
              : "Reporting moves to the new person straight away. The old credit stays in the history."}
          </p>

          {!isNew && studentId && (
            <div className="space-y-2">
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground -ml-2 text-xs"
                aria-expanded={showHistory}
                onClick={() => setShowHistory((current) => !current)}
              >
                {showHistory ? "Hide history" : "View history"}
              </Button>
              {showHistory && <ReferralHistory studentMemberId={studentId} />}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={clearing ? "destructive" : "primary"}
            disabled={!studentId || !referrerId || pending}
            onClick={save}
          >
            {pending
              ? "Saving…"
              : clearing
                ? "Remove credit"
                : isNew
                  ? "Record referral"
                  : "Save change"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReferralHistory({ studentMemberId }: { studentMemberId: string }) {
  const trpc = useTRPC();
  const history = useQuery(
    trpc.referral.history.queryOptions({ studentMemberId }),
  );
  if (history.isPending) return <SkeletonRows rows={2} />;
  if (history.isError)
    return (
      <ErrorState
        label="referral history"
        onRetry={() => void history.refetch()}
      />
    );
  if (history.data.length === 0)
    return (
      <span className="text-muted-foreground text-xs">Nothing recorded.</span>
    );
  return (
    <ol className="border-border space-y-2 border-l pl-3">
      {history.data.map((event) => (
        <li key={event.id} className="text-xs">
          <span className="font-medium capitalize">{event.action}</span>
          <span className="text-muted-foreground block">
            {event.oldReferrerName ? `${event.oldReferrerName} → ` : ""}
            {event.newReferrerName ?? "Nobody"}
          </span>
          <span className="text-muted-foreground block font-mono text-[10px]">
            {dateTimeFmt.format(new Date(event.occurredAt))} · {event.actorName}
          </span>
        </li>
      ))}
    </ol>
  );
}
