"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  entityHref,
  formatMoney,
  isStaffRole,
  isStudentMember,
  matchesDirectoryFilter,
  matchPeopleByEmail,
  parseEmailList,
} from "@matops/domain";
import { Button } from "@matops/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@matops/ui/dialog";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import {
  OrganizationExportDialog,
  StudentImportDialog,
} from "./data-transfer-dialogs";
import { useOrganization } from "./entity";
import { cardClass, ENTER, Eyebrow, stagger } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";
import { Tabs } from "./tabs";

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
  const directory = useQuery(trpc.person.directory.queryOptions());
  const branchSummary = useQuery(trpc.stats.organizationMembers.queryOptions());
  const accessPlans = useQuery(trpc.accessPlan.list.queryOptions());
  const tabParam = useSearchParams().get("tab");
  const [tab, setTab] = useState<PeopleTab>(
    tabParam === "staff" ? "staff" : "people",
  );
  const [search, setSearch] = useState("");
  const [entityId, setEntityId] = useState("");
  const [planName, setPlanName] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Memoised so the `?? []` fallback is not a new array on every render, which
  // would defeat the two useMemo hooks below.
  const rows = useMemo(
    () =>
      (directory.data ?? []).map((person) => {
        const summary = branchSummary.data?.rows.find(
          (row) => row.userId === person.id,
        );
        return {
          personId: person.id,
          userId: person.id,
          accountUserId: person.accountUserId,
          name: person.name,
          email: person.email ?? "",
          phone: person.phone,
          recentVisits: summary?.recentVisits ?? 0,
          planNames: summary?.planNames ?? [],
          branches: person.branches.map((branch) => {
            const summaryBranch = summary?.branches.find(
              (row) => row.entityId === branch.entityId,
            );
            return {
              ...branch,
              memberId: summaryBranch?.memberId ?? branch.enrollmentId,
              covered: summaryBranch?.covered ?? false,
              verdict: summaryBranch?.verdict ?? null,
              recentVisits: summaryBranch?.recentVisits ?? 0,
            };
          }),
        };
      }),
    [directory.data, branchSummary.data],
  );
  const students = useMemo(
    () => rows.filter((r) => r.branches.some(isStudentMember)),
    [rows],
  );
  const plans = useMemo(
    () => [...new Set(rows.flatMap((r) => r.planNames))].sort(),
    [rows],
  );
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (
      tab === "staff"
        ? rows.filter((row) => row.branches.some(isStaffRole))
        : students
    )
      .filter((r) =>
        matchesDirectoryFilter(
          {
            ...r,
            branches: r.branches.filter((b) =>
              tab === "staff" ? isStaffRole(b) : isStudentMember(b),
            ),
          },
          {
            entityId: entityId || undefined,
            planName: planName || undefined,
            status: status || undefined,
          },
        ),
      )
      .filter(
        (r) =>
          !needle ||
          r.name.toLowerCase().includes(needle) ||
          r.email.toLowerCase().includes(needle),
      );
  }, [rows, students, tab, search, entityId, planName, status]);

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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setExporting(true)}>
            Export data
          </Button>
          <Button variant="outline" onClick={() => setImporting(true)}>
            Import students
          </Button>
          <Button onClick={() => setCreating(true)}>Add student</Button>
        </div>
      </div>

      {creating && (
        <CreateStudentDialog
          entities={branchSummary.data?.entities ?? []}
          onOpenChange={setCreating}
        />
      )}
      {importing && (
        <StudentImportDialog
          entities={branchSummary.data?.entities ?? []}
          plans={accessPlans.data ?? []}
          onOpenChange={setImporting}
        />
      )}
      {exporting && <OrganizationExportDialog onOpenChange={setExporting} />}

      <Tabs
        label="Members or staff"
        value={tab}
        onChange={(next) => {
          setTab(next);
          setSelected([]);
          setPlanName("");
        }}
        tabs={[
          { id: "people", label: "Members", count: students.length },
          {
            id: "staff",
            label: "Staff",
            count: rows.filter((row) => row.branches.some(isStaffRole)).length,
          },
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
            {(branchSummary.data?.entities ?? []).map((e) => (
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

      {directory.isPending || branchSummary.isPending ? (
        <SkeletonRows rows={4} />
      ) : directory.isError || branchSummary.isError ? (
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
          {shown.map((r, i) => (
            <li
              key={r.personId}
              style={stagger(i)}
              className={`${cardClass()} ${ENTER}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                {tab !== "staff" && (
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    aria-label={`Select ${r.name}`}
                    checked={selected.includes(r.personId)}
                    onChange={(e) =>
                      setSelected((was) =>
                        e.target.checked
                          ? [...was, r.personId]
                          : was.filter((id) => id !== r.personId),
                      )
                    }
                  />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link
                    href={`/people/${r.personId}`}
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
                  {r.branches
                    .filter((b) =>
                      tab === "staff" ? isStaffRole(b) : isStudentMember(b),
                    )
                    .map((b) => (
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
                          {isStaffRole(b)
                            ? ` · ${b.invitedRole === "instructor" && b.status === "pending" ? "instructor" : b.role}`
                            : ""}
                          {b.status !== "active" ? ` · ${b.status}` : ""}
                          {!isStaffRole(b) && b.verdict && b.verdict !== "ok"
                            ? " ·  ⚠"
                            : ""}
                        </Link>
                      </Button>
                    ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab !== "staff" && selected.length > 0 && (
        <BulkAssign selected={selected} onDone={() => setSelected([])} />
      )}

      {tab !== "staff" && (
        <div className="flex flex-wrap gap-2">
          <PasteEmails
            people={students}
            onMatched={(ids) => setSelected(ids)}
          />
        </div>
      )}

      <Eyebrow>
        {shown.length === 1 ? "1 person" : `${shown.length} people`}
      </Eyebrow>
    </div>
  );
}

function CreateStudentDialog({
  entities,
  onOpenChange,
}: {
  entities: { id: string; name: string }[];
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const input = {
    name: name.trim() || "Student",
    email: email.trim() || undefined,
    phone: phone.trim() || undefined,
  };
  const preview = useQuery({
    ...trpc.person.previewCreateStudent.queryOptions(input),
    enabled: reviewed,
  });
  const create = useMutation(
    trpc.person.createStudent.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        toast.success("Student added");
        onOpenChange(false);
      },
      onError: (error) =>
        toast.error(error.message || "Couldn't add the student. Try again."),
    }),
  );
  const resetReview = () => setReviewed(false);
  const submit = (
    duplicateDecision?:
      | { kind: "use_existing"; personId: string }
      | { kind: "create_separate"; reviewedPersonIds: string[] },
  ) => create.mutate({ entityId, ...input, duplicateDecision });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Add a student</DialogTitle>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-student-branch">Branch</Label>
            <Select
              id="new-student-branch"
              value={entityId}
              onChange={(event) => setEntityId(event.target.value)}
            >
              <option value="">Pick a branch…</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-student-name">Name</Label>
            <Input
              id="new-student-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                resetReview();
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-student-email">Email, optional</Label>
            <Input
              id="new-student-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                resetReview();
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-student-phone">Phone, optional</Label>
            <Input
              id="new-student-phone"
              type="tel"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                resetReview();
              }}
            />
          </div>
          {preview.isError && (
            <p role="alert" className="text-error text-sm">
              {preview.error.message}
            </p>
          )}
          {preview.data && preview.data.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Possible matches</p>
              {preview.data.map((match) => (
                <div
                  key={match.personId}
                  className="border-border flex flex-wrap items-center gap-2 rounded-md border p-3"
                >
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{match.name}</p>
                    <p className="text-muted-foreground">
                      {[match.email, match.phone].filter(Boolean).join(" · ") ||
                        "No contact details"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={create.isPending || match.archivedAt !== null}
                    onClick={() =>
                      submit({
                        kind: "use_existing",
                        personId: match.personId,
                      })
                    }
                  >
                    {match.archivedAt ? "Archived" : "Use this person"}
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                disabled={create.isPending}
                onClick={() =>
                  submit({
                    kind: "create_separate",
                    reviewedPersonIds: preview.data.map(
                      (match) => match.personId,
                    ),
                  })
                }
              >
                Create a separate person
              </Button>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {!reviewed ? (
              <Button
                disabled={!entityId || !name.trim()}
                onClick={() => setReviewed(true)}
              >
                Review
              </Button>
            ) : preview.data?.length === 0 ? (
              <Button disabled={create.isPending} onClick={() => submit()}>
                {create.isPending ? "Adding…" : "Add student"}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
    memberId: string | null;
    status: string;
    role: string;
    invitedRole: string | null;
  },
  tab: PeopleTab,
): string {
  if (tab === "staff" || isStaffRole(b) || !b.memberId) {
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
      onError: (e) =>
        toast.error(e.message || "Couldn't put them on it. Try again."),
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
        onClick={() => assign.mutate({ personIds: selected, planId })}
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
  people: { personId: string; email: string }[];
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
            const found = matchPeopleByEmail(
              people.map((person) => ({
                userId: person.personId,
                email: person.email,
              })),
              parseEmailList(text),
            );
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
