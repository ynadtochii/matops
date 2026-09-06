"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { entityHref, formatMoney } from "@matops/domain";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
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
export function OrganizationPersonScreen({ userId }: { userId: string }) {
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
  const busy = assign.isPending || suspend.isPending || cancel.isPending;
  const directory = useQuery({
    ...trpc.stats.organizationMembers.queryOptions(),
    enabled: canRunOrganization,
  });
  const held = useQuery({
    ...trpc.accessPlan.forUser.queryOptions({ userId }),
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
    return <EmptyState title="Only an owner can open this." />;
  }
  if (directory.isPending || held.isPending) return <SkeletonRows rows={4} />;
  if (directory.isError || held.isError) {
    return (
      <ErrorState
        label="this person"
        onRetry={() => {
          void directory.refetch();
          void held.refetch();
        }}
      />
    );
  }

  const person = directory.data.rows.find((r) => r.userId === userId);
  if (!person) {
    return (
      <EmptyState title="Nobody here by that link.">
        They may have been removed from every branch of this gym.
      </EmptyState>
    );
  }

  return (
    <div className={`${ENTER} flex flex-col gap-6`}>
      <PageHeader title={person.name} subtitle={person.email} />

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
                </span>
              </div>
              {/* Local work stays where it belongs: role, rank, notes and
                  attendance are that branch's business (ADR 128). */}
              <Button asChild size="sm" variant="outline">
                <Link href={entityHref(b.entityId, "/members")}>
                  Open at this branch
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <Eyebrow>Memberships</Eyebrow>
        {held.data.length === 0 ? (
          <EmptyState title="They hold no membership.">
            Give them one from their member profile at any branch.
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
                  (c) => c.assignmentId === h.id && c.userId === userId,
                ) && (
                  <span className="text-brand-strong text-xs font-medium">
                    Said they paid — waiting for you to confirm
                  </span>
                )}
                <PaymentHistory assignmentId={h.id} />
                <div className="mt-1 flex flex-wrap gap-2">
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
                        assign.mutate({ userId, planId: h.planId })
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

        {/* Adding is how a plan CHANGE is made too: give them the new one and
            end the old. Two clicks, and both are recorded. */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-48 flex-1 flex-col gap-2">
            <Eyebrow as="span">Give a membership</Eyebrow>
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
            onClick={() => assign.mutate({ userId, planId: picked })}
          >
            {assign.isPending ? "Adding…" : "Add"}
          </Button>
        </div>
      </section>
    </div>
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
