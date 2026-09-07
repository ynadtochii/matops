"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AccessVerdict } from "@matops/domain";
import {
  accessReason,
  entityHref,
  formatMoney,
  isStaffRole,
  isStudentMember,
} from "@matops/domain";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@matops/ui/dialog";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { useOrganization } from "./entity";
import { PageHeader } from "./page-header";
import { cardClass, ENTER, Eyebrow } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";

/**
 * One person, across the whole gym (spec FP7 groundwork, ADR 128).
 *
 * The branch member screen answers "who is this at MY mat": their role, their
 * rank, whether they turned up. This one answers "who is this to the gym":
 * which branches they belong to and which memberships they hold, which is the
 * question an owner has to answer before changing anybody's coverage.
 *
 * It reads the directory the list screen already draws rather than a query of
 * its own, so arriving from the list costs nothing and the two screens cannot
 * disagree about somebody's branches.
 */
export function OrganizationPersonScreen({ personId }: { personId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { canRunOrganization, entities } = useOrganization();
  const plans = useQuery({
    ...trpc.accessPlan.list.queryOptions(),
    enabled: canRunOrganization,
  });
  const [picked, setPicked] = useState("");

  // Every membership write invalidates everything: coverage decides who may
  // book, so a stale list here is worse than a second round trip.
  const after = async (message: string) => {
    await queryClient.invalidateQueries();
    toast.success(message);
  };
  const assign = useMutation(
    trpc.accessPlan.assign.mutationOptions({
      onSuccess: async () => {
        setPicked("");
        await after("Membership given");
      },
      onError: (e) =>
        toast.error(e.message || "Could not give that membership"),
    }),
  );
  const suspend = useMutation(
    trpc.accessPlan.suspend.mutationOptions({
      onSuccess: () => after("Membership paused"),
      onError: (e) => toast.error(e.message || "Could not pause it"),
    }),
  );
  const cancel = useMutation(
    trpc.accessPlan.cancel.mutationOptions({
      onSuccess: () => after("Membership ended"),
      onError: (e) => toast.error(e.message || "Could not end it"),
    }),
  );
  const setBranchRole = useMutation(
    trpc.entity.setBranchRole.mutationOptions({
      onSuccess: () => after("Branch updated"),
      onError: (e) => toast.error(e.message || "Could not change that"),
    }),
  );
  const decide = useMutation(
    trpc.entity.decideAtBranch.mutationOptions({
      onSuccess: () => after("Decision saved"),
      onError: (e) => toast.error(e.message || "Could not save that"),
    }),
  );
  const cancelChange = useMutation(
    trpc.accessPlan.cancelScheduledChange.mutationOptions({
      onSuccess: () => after("Plan change cancelled"),
      onError: (e) => toast.error(e.message || "Could not cancel it"),
    }),
  );
  const [changing, setChanging] = useState<{
    assignmentId: string;
    planName: string;
  } | null>(null);
  const busy =
    assign.isPending ||
    suspend.isPending ||
    cancel.isPending ||
    cancelChange.isPending ||
    setBranchRole.isPending ||
    decide.isPending;
  const personQuery = useQuery({
    ...trpc.person.get.queryOptions({ personId, includeArchived: true }),
    enabled: canRunOrganization,
  });
  const directory = useQuery({
    ...trpc.stats.organizationMembers.queryOptions(),
    enabled: canRunOrganization,
  });
  const held = useQuery({
    ...trpc.accessPlan.forUser.queryOptions({ personId }),
    enabled: canRunOrganization,
  });
  // The gym's open claims, narrowed to this person. One read the Memberships
  // screen already makes, rather than a second query for one row.
  const claims = useQuery({
    ...trpc.accessPlan.claims.queryOptions(),
    enabled: canRunOrganization,
  });

  const nameOf = (id: string) =>
    entities.find((e) => e.id === id)?.name ?? "a branch";

  if (!canRunOrganization) {
    return (
      <EmptyState title="Only the people who run this gym can open this." />
    );
  }
  if (personQuery.isPending || directory.isPending || held.isPending)
    return <SkeletonRows rows={4} />;
  if (personQuery.isError || directory.isError || held.isError) {
    return (
      <ErrorState
        label="this person"
        onRetry={() => {
          void personQuery.refetch();
          void directory.refetch();
          void held.refetch();
        }}
      />
    );
  }

  const legacyPerson = directory.data.rows.find(
    (row) => row.userId === personId,
  );
  const person = {
    ...personQuery.data,
    branches: personQuery.data.branches.map((branch) => {
      const legacyBranch = legacyPerson?.branches.find(
        (row) => row.entityId === branch.entityId,
      );
      return {
        ...branch,
        memberId: legacyBranch?.memberId ?? branch.enrollmentId,
        covered: legacyBranch?.covered ?? false,
        verdict: legacyBranch?.verdict ?? null,
      };
    }),
  };

  const hasStudentBranch = person.branches.some(isStudentMember);

  return (
    <div className={`${ENTER} flex flex-col gap-6`}>
      <PageHeader
        title={person.name}
        subtitle={person.email ?? "No email address"}
      />

      <PersonAccess
        person={{
          personId: person.id,
          account: person.account,
          guardians: person.guardians,
          archivedAt: person.archivedAt,
          updatedAt: person.updatedAt,
        }}
      />

      <section className="flex flex-col gap-3">
        <Eyebrow>Branches</Eyebrow>
        <ul className="flex flex-col gap-2">
          {person.branches.map((b) => (
            <li
              key={b.entityId}
              className={`${cardClass()} flex flex-wrap items-center gap-3`}
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{b.entityName}</span>
                <span className="text-muted-foreground text-sm">
                  {b.role}
                  {b.status !== "active" ? ` · ${b.status}` : ""}
                  {isStaffRole(b)
                    ? b.status === "active"
                      ? " · Staff access. No membership required"
                      : " · Staff access is not active"
                    : b.verdict && b.verdict !== "ok"
                      ? ` · ${accessReason(b.verdict as AccessVerdict, b.entityName)}`
                      : b.covered
                        ? " · covered"
                        : " · no membership covers them here"}
                </span>
              </div>
              {/* A request is a per-branch decision, so it is answered here
                  branch by branch rather than in one sweep (ADR 129). */}
              {b.status === "pending" && (
                <>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      decide.mutate({
                        entityId: b.entityId,
                        personId,
                        decision: "approve",
                      })
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      decide.mutate({
                        entityId: b.entityId,
                        personId,
                        decision: "decline",
                      })
                    }
                  >
                    Decline
                  </Button>
                </>
              )}
              {b.role !== "owner" &&
                b.role !== "manager" &&
                b.status === "active" && (
                  <Select
                    aria-label={`Role at ${b.entityName}`}
                    value={b.role === "instructor" ? "instructor" : "student"}
                    disabled={busy}
                    onChange={(e) =>
                      setBranchRole.mutate({
                        entityId: b.entityId,
                        personId,
                        role: e.target.value as "student" | "instructor",
                      })
                    }
                  >
                    <option value="student">Student</option>
                    <option value="instructor">Instructor</option>
                  </Select>
                )}
              {/* Rank, notes and attendance stay that branch's business
                  (ADR 128). */}
              <Button asChild size="sm" variant="outline">
                <Link
                  href={entityHref(
                    b.entityId,
                    isStaffRole(b) || !b.memberId
                      ? "/coaches"
                      : `/members?tab=${b.status === "pending" ? "requests" : b.status === "archived" ? "archived" : "members"}&member=${encodeURIComponent(b.memberId)}`,
                  )}
                >
                  Open at this branch
                </Link>
              </Button>
            </li>
          ))}
        </ul>
        <BranchAssign
          held={person.branches.map((b) => b.entityId)}
          busy={busy}
          onAssign={(entityId, role) =>
            setBranchRole.mutate({ entityId, personId, role })
          }
        />
      </section>

      <section className="flex flex-col gap-3">
        <Eyebrow>Memberships</Eyebrow>
        {held.data.length === 0 ? (
          <EmptyState
            title={
              hasStudentBranch
                ? "They hold no membership."
                : "No membership required."
            }
          >
            {hasStudentBranch
              ? "Give them a membership for the branches where they are a student."
              : "Staff access comes from their role at each branch."}
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {held.data.map((h) => (
              <li key={h.id} className={`${cardClass()} flex flex-col gap-1`}>
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
                {h.status === "active" && h.month && (
                  <span className="text-muted-foreground text-xs">
                    {h.monthLabel}
                    {h.amount
                      ? ` · ${formatMoney(h.amount.priceMinor, h.amount.currency)}`
                      : ""}{" "}
                    · {h.paid ? "paid" : "not paid yet"}
                  </span>
                )}
                {(claims.data ?? []).some(
                  (c) => c.assignmentId === h.id && c.personId === personId,
                ) && (
                  <span className="text-brand-strong text-xs font-medium">
                    Said they paid — waiting for you to confirm
                  </span>
                )}
                {h.pendingChange && (
                  <span className="text-brand-strong text-xs font-medium">
                    Moves to {h.pendingChange.targetPlanName ?? "another plan"}{" "}
                    on 1 {h.pendingChange.effectiveMonthLabel}
                  </span>
                )}
                {h.status === "active" &&
                  h.entityIds.length > 0 &&
                  h.entityIds.every((id) =>
                    person.branches.some(
                      (b) =>
                        b.entityId === id &&
                        isStaffRole(b) &&
                        b.status === "active",
                    ),
                  ) && (
                    <p className="text-muted-foreground text-sm">
                      Staff access covers every branch on this plan. Review
                      whether this membership should end. Payment history stays
                      unchanged.
                    </p>
                  )}
                <PaymentHistory assignmentId={h.id} />
                <div className="mt-1 flex flex-wrap gap-2">
                  {h.status === "active" &&
                    !h.pendingChange &&
                    h.appliesNow && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          setChanging({
                            assignmentId: h.id,
                            planName: h.planName,
                          })
                        }
                      >
                        Change plan
                      </Button>
                    )}
                  {h.pendingChange && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        cancelChange.mutate({
                          changeId: h.pendingChange?.id ?? "",
                        })
                      }
                    >
                      Cancel the change
                    </Button>
                  )}
                  {h.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => suspend.mutate({ id: h.id })}
                    >
                      Pause
                    </Button>
                  )}
                  {h.status === "suspended" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        assign.mutate({ personId, planId: h.planId })
                      }
                    >
                      Resume
                    </Button>
                  )}
                  {h.status !== "cancelled" && (
                    <ConfirmDialog
                      title="End this membership?"
                      description="It stops covering every branch it covers. Their branch memberships, history and bookings all stay."
                      confirmLabel="End it"
                      onConfirm={async () => {
                        await cancel.mutateAsync({ id: h.id });
                      }}
                      trigger={
                        <Button size="sm" variant="outline" disabled={busy}>
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

        {changing && (
          <PlanChangeDialog
            assignmentId={changing.assignmentId}
            currentPlanName={changing.planName}
            personId={personId}
            plans={(plans.data ?? []).filter((p) => !p.archived)}
            nameOf={nameOf}
            onOpenChange={(open) => {
              if (!open) setChanging(null);
            }}
            onDone={async () => {
              setChanging(null);
              await after("Plan change scheduled");
            }}
          />
        )}

        {/* An ADDITIONAL independent plan. Replacing one they hold is
            "Change plan" on that membership, which waits for the 1st. */}
        {hasStudentBranch && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-48 flex-1 flex-col gap-2">
              <Eyebrow as="span">Add another membership</Eyebrow>
              <Select
                id="person-plan"
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
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
              disabled={busy || picked === ""}
              onClick={() => assign.mutate({ personId, planId: picked })}
            >
              {assign.isPending ? "Adding…" : "Add"}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function PersonAccess({
  person,
}: {
  person: {
    personId: string;
    account: { userId: string; name: string; email: string } | null;
    guardians: {
      relationId: string;
      userId: string;
      name: string;
      email: string;
    }[];
    archivedAt: Date | null;
    updatedAt: Date;
  };
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [accountEmail, setAccountEmail] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianSearch, setGuardianSearch] = useState("");
  const accountCandidate = useQuery({
    ...trpc.person.accountCandidate.queryOptions({
      personId: person.personId,
      email: accountSearch || "placeholder@example.com",
    }),
    enabled: accountSearch !== "",
  });
  const guardianCandidate = useQuery({
    ...trpc.person.guardianCandidate.queryOptions({
      studentPersonId: person.personId,
      email: guardianSearch || "placeholder@example.com",
    }),
    enabled: guardianSearch !== "",
  });
  const refresh = async (message: string) => {
    await queryClient.invalidateQueries(trpc.person.pathFilter());
    toast.success(message);
  };
  const link = useMutation(
    trpc.person.linkAccount.mutationOptions({
      onSuccess: () => refresh("Account linked"),
      onError: (error) => toast.error(error.message || "Could not link it"),
    }),
  );
  const unlink = useMutation(
    trpc.person.unlinkAccount.mutationOptions({
      onSuccess: () => refresh("Account unlinked"),
      onError: (error) => toast.error(error.message || "Could not unlink it"),
    }),
  );
  const addGuardian = useMutation(
    trpc.person.addGuardian.mutationOptions({
      onSuccess: () => refresh("Guardian added"),
      onError: (error) =>
        toast.error(error.message || "Could not add that guardian"),
    }),
  );
  const removeGuardian = useMutation(
    trpc.person.removeGuardian.mutationOptions({
      onSuccess: () => refresh("Guardian removed"),
      onError: (error) =>
        toast.error(error.message || "Could not remove that guardian"),
    }),
  );
  const archive = useMutation(
    trpc.person.archive.mutationOptions({
      onSuccess: () => refresh("Person archived"),
      onError: (error) => toast.error(error.message || "Could not archive"),
    }),
  );
  const restore = useMutation(
    trpc.person.restore.mutationOptions({
      onSuccess: () => refresh("Person restored"),
      onError: (error) => toast.error(error.message || "Could not restore"),
    }),
  );
  const busy =
    link.isPending ||
    unlink.isPending ||
    addGuardian.isPending ||
    removeGuardian.isPending ||
    archive.isPending ||
    restore.isPending;
  const expectedUpdatedAt = new Date(person.updatedAt).toISOString();
  const accountMatch = accountCandidate.data;
  const guardianMatch = guardianCandidate.data;

  return (
    <section className="flex flex-col gap-3">
      <Eyebrow>Access</Eyebrow>
      {person.archivedAt ? (
        <div className={`${cardClass()} flex flex-wrap items-center gap-3`}>
          <p className="min-w-0 flex-1 text-sm">
            This person is archived. Restore them before making changes.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => restore.mutate({ personId: person.personId })}
          >
            Restore
          </Button>
        </div>
      ) : (
        <>
          <div className={`${cardClass()} flex flex-col gap-3`}>
            <div>
              <p className="font-medium">Login account</p>
              <p className="text-muted-foreground text-sm">
                {person.account
                  ? `${person.account.name} · ${person.account.email}`
                  : "No login account is linked."}
              </p>
            </div>
            {person.account ? (
              <ConfirmDialog
                title="Unlink this account?"
                description="The person and their history stay. They cannot sign in as this person until another account is linked."
                confirmLabel="Unlink account"
                onConfirm={async () => {
                  await unlink.mutateAsync({
                    personId: person.personId,
                    expectedAccountUserId: person.account?.userId ?? "",
                    expectedUpdatedAt,
                  });
                }}
                trigger={
                  <Button size="sm" variant="outline" disabled={busy}>
                    Unlink account
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex min-w-56 flex-1 flex-col gap-1.5">
                  <Label htmlFor="person-account-email">Verified email</Label>
                  <Input
                    id="person-account-email"
                    type="email"
                    value={accountEmail}
                    onChange={(event) => {
                      setAccountEmail(event.target.value);
                      setAccountSearch("");
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !accountEmail.trim()}
                  onClick={() => setAccountSearch(accountEmail.trim())}
                >
                  Find account
                </Button>
                {accountMatch && (
                  <Button
                    size="sm"
                    disabled={busy || accountMatch.linkedPersonId !== null}
                    onClick={() =>
                      link.mutate({
                        personId: person.personId,
                        accountUserId: accountMatch.userId,
                        expectedUpdatedAt,
                      })
                    }
                  >
                    Link {accountMatch.name}
                  </Button>
                )}
              </div>
            )}
            {accountSearch &&
              !accountCandidate.isPending &&
              !accountCandidate.data && (
                <p className="text-muted-foreground text-sm">
                  No verified account has that email.
                </p>
              )}
            {accountMatch?.linkedPersonId && (
              <p className="text-error text-sm">
                That account is already linked to another person.
              </p>
            )}
          </div>

          <div className={`${cardClass()} flex flex-col gap-3`}>
            <div>
              <p className="font-medium">Guardians</p>
              <p className="text-muted-foreground text-sm">
                Guardians can book and cancel classes for this student.
              </p>
            </div>
            {person.guardians.length > 0 && (
              <ul className="flex flex-col gap-2">
                {person.guardians.map((guardian) => (
                  <li
                    key={guardian.relationId}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="min-w-0 flex-1">
                      {guardian.name} · {guardian.email}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        removeGuardian.mutate({
                          studentPersonId: person.personId,
                          guardianUserId: guardian.userId,
                        })
                      }
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex min-w-56 flex-1 flex-col gap-1.5">
                <Label htmlFor="guardian-account-email">Guardian email</Label>
                <Input
                  id="guardian-account-email"
                  type="email"
                  value={guardianEmail}
                  onChange={(event) => {
                    setGuardianEmail(event.target.value);
                    setGuardianSearch("");
                  }}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !guardianEmail.trim()}
                onClick={() => setGuardianSearch(guardianEmail.trim())}
              >
                Find guardian
              </Button>
              {guardianMatch && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    addGuardian.mutate({
                      studentPersonId: person.personId,
                      guardianUserId: guardianMatch.userId,
                    })
                  }
                >
                  Add {guardianMatch.name}
                </Button>
              )}
            </div>
            {guardianSearch &&
              !guardianCandidate.isPending &&
              !guardianCandidate.data && (
                <p className="text-muted-foreground text-sm">
                  No verified account has that email.
                </p>
              )}
          </div>

          <ConfirmDialog
            title="Archive this person?"
            description="Their history stays. Restore them before changing their account, guardians, branches, or memberships."
            confirmLabel="Archive person"
            onConfirm={async () => {
              await archive.mutateAsync({ personId: person.personId });
            }}
            trigger={
              <Button
                className="self-start"
                size="sm"
                variant="outline"
                disabled={busy}
              >
                Archive person
              </Button>
            }
          />
        </>
      )}
    </section>
  );
}

/**
 * Put this person on a branch they are not on yet (ADR 129).
 *
 * Ordinary roles only, so this can never make an owner: that stays on the
 * branch's own Coaches page.
 */
function BranchAssign({
  held,
  busy,
  onAssign,
}: {
  held: string[];
  busy: boolean;
  onAssign: (entityId: string, role: "student" | "instructor") => void;
}) {
  const { entities } = useOrganization();
  const [entityId, setEntityId] = useState("");
  const [role, setRole] = useState<"student" | "instructor">("instructor");
  const free = entities.filter((e) => !held.includes(e.id));
  if (free.length === 0) return null;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex min-w-40 flex-1 flex-col gap-2">
        <Eyebrow as="span">Add them to a branch</Eyebrow>
        <Select
          aria-label="Branch"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
        >
          <option value="">Pick a branch…</option>
          {free.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
      </div>
      <Select
        aria-label="Role at that branch"
        value={role}
        onChange={(e) => setRole(e.target.value as "student" | "instructor")}
      >
        <option value="instructor">Instructor</option>
        <option value="student">Student</option>
      </Select>
      <Button
        size="sm"
        disabled={busy || entityId === ""}
        onClick={() => {
          onAssign(entityId, role);
          setEntityId("");
        }}
      >
        Add
      </Button>
    </div>
  );
}

/**
 * Move one membership onto another plan from the first of next month (ADR 129).
 *
 * The month is the server's, not this screen's: the preview says which one it
 * is and what the new plan costs then. The month they are in does not move, so
 * nothing here talks about proration, refunds or a part month.
 */
function PlanChangeDialog({
  assignmentId,
  currentPlanName,
  personId,
  plans,
  nameOf,
  onOpenChange,
  onDone,
}: {
  assignmentId: string;
  currentPlanName: string;
  personId: string;
  plans: { id: string; name: string }[];
  nameOf: (id: string) => string;
  onOpenChange: (open: boolean) => void;
  onDone: () => Promise<void>;
}) {
  const trpc = useTRPC();
  const [targetPlanId, setTargetPlanId] = useState("");

  const preview = useQuery({
    ...trpc.accessPlan.previewChange.queryOptions({
      assignmentId,
      targetPlanId,
    }),
    enabled: targetPlanId !== "",
  });
  const review = useQuery({
    ...trpc.accessPlan.bookingsToReview.queryOptions({ personId, limit: 20 }),
    enabled: targetPlanId !== "" && (preview.data?.loses.length ?? 0) > 0,
  });
  const schedule = useMutation(
    trpc.accessPlan.scheduleChange.mutationOptions({
      onSuccess: onDone,
      onError: (e) => toast.error(e.message || "Could not schedule it"),
    }),
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Change plan from {currentPlanName}</DialogTitle>
        <div className="flex flex-col gap-4">
          <Select
            id="change-plan"
            aria-label="New plan"
            value={targetPlanId}
            onChange={(e) => setTargetPlanId(e.target.value)}
          >
            <option value="">Pick the new plan…</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>

          {preview.isPending && targetPlanId !== "" && (
            <p className="text-muted-foreground text-sm">Working it out…</p>
          )}
          {preview.isError && (
            <p className="text-error text-sm">{preview.error.message}</p>
          )}
          {preview.data && (
            <div className="flex flex-col gap-2 text-sm">
              <p>
                {currentPlanName} runs to the end of this month.{" "}
                {preview.data.targetPlanName} starts on 1{" "}
                {preview.data.effectiveMonthLabel}
                {preview.data.amount
                  ? ` at ${formatMoney(preview.data.amount.priceMinor, preview.data.amount.currency)} a month`
                  : ", with no price set yet"}
                . This month is not re-charged and nothing is refunded.
              </p>
              {preview.data.gains.length > 0 && (
                <p>They gain {preview.data.gains.map(nameOf).join(", ")}.</p>
              )}
              {preview.data.loses.length > 0 && (
                <p>
                  They lose {preview.data.loses.map(nameOf).join(", ")}. Nothing
                  else of theirs covers those.
                </p>
              )}
              {(review.data?.items.length ?? 0) > 0 && (
                <div className="flex flex-col gap-1">
                  <Eyebrow as="span">Bookings to review</Eyebrow>
                  <ul className="text-muted-foreground flex flex-col gap-0.5">
                    {(review.data?.items ?? []).map((b) => (
                      <li key={b.participationId}>
                        {b.title} at {b.entityName} on{" "}
                        {b.startsAt.toLocaleDateString()}
                      </li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground">
                    These stay booked. Cancel them from the class if you want
                    them gone.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={targetPlanId === "" || schedule.isPending}
              onClick={() => schedule.mutate({ assignmentId, targetPlanId })}
            >
              {schedule.isPending ? "Scheduling…" : "Schedule the change"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What this membership has been charged, month by month, newest first.
 *
 * Each line reads the amount that applied to ITS month, so a price rise does
 * not rewrite what an earlier month says (ADR 128). A month with no row is
 * unpaid and is simply absent: the tracker is ticked by hand, and inventing a
 * line for a gap would make it look answered.
 */
function PaymentHistory({ assignmentId }: { assignmentId: string }) {
  const trpc = useTRPC();
  const months = useQuery(
    trpc.accessPlan.months.queryOptions({ assignmentId }),
  );

  if (months.isPending || months.isError) return null;
  if (months.data.length === 0) return null;

  return (
    <details className="mt-1">
      <summary className="text-muted-foreground cursor-pointer text-xs">
        {months.data.length === 1
          ? "1 month recorded"
          : `${months.data.length} months recorded`}
      </summary>
      <ul className="mt-1 flex flex-col gap-0.5">
        {months.data.map((m) => (
          <li key={m.month} className="text-muted-foreground text-xs">
            {m.month}
            {m.amount
              ? ` · ${formatMoney(m.amount.priceMinor, m.amount.currency)}`
              : ""}{" "}
            · {m.paid ? "paid" : "not paid"}
          </li>
        ))}
      </ul>
    </details>
  );
}
