"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import {
  entitiesNeedingAttention,
  entityHref,
  formatMoney,
} from "@matops/domain";
import { Logo } from "@matops/ui/logo";

import { useTRPC } from "~/trpc/react";
import { useOrganization } from "./entity";
import { AddAcademyButton } from "./entity-selector";
import { JoinByCode } from "./join-by-code";
import { cardClass, ENTER, Eyebrow, Stat } from "./primitives";
import { SkeletonCard } from "./skeletons";

type Summary = RouterOutputs["stats"]["organization"];
type EntityRow = Summary["entities"][number];

// A student of one mat has no business knowing the organization runs two, so
// only an owner gets the totals.
export function OverviewScreen() {
  const { entities, canAdd } = useOrganization();

  if (entities.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <JoinByCode />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6 py-12">
      <Logo size={30} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Your academies
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {canAdd
              ? "Pick a mat to run, or add another."
              : "Pick a mat to open."}
          </p>
        </div>
        {canAdd && <AddAcademyButton />}
      </div>

      {canAdd ? (
        <OwnerOverview />
      ) : (
        <ul className="flex flex-col gap-2">
          {entities.map((e) => (
            <li key={e.id}>
              <PlainCard id={e.id} name={e.name} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OwnerOverview() {
  const trpc = useTRPC();
  const summary = useQuery(trpc.stats.organization.queryOptions());

  if (summary.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (summary.isError) return <FallbackList />;

  const { members, upcomingClasses, revenue, entities } = summary.data;
  const waiting = entitiesNeedingAttention(entities);

  return (
    <div className={`flex flex-col gap-8 ${ENTER}`}>
      <div className={cardClass()}>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <Stat value={members} label="People" />
          <Stat value={upcomingClasses} label="Classes this week" />
          {revenue.length === 0 ? (
            <Stat value="—" label="Paid this month" />
          ) : (
            revenue.map((m) => (
              <Stat
                key={m.currency}
                value={formatMoney(m.amountMinor, m.currency)}
                label="Paid this month"
              />
            ))
          )}
        </div>
      </div>

      {waiting.length > 0 && (
        <section className="flex flex-col gap-3">
          <Eyebrow>Waiting on you</Eyebrow>
          <ul className="flex flex-col gap-2">
            {waiting.map((e) => (
              <li key={e.entityId}>
                <Link
                  href={entityHref(e.entityId)}
                  className={cardClass({ interactive: true })}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium">{e.name}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {waitingLabel(e)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="flex flex-col gap-2">
        {entities.map((e) => (
          <li key={e.entityId}>
            <PlainCard
              id={e.entityId}
              name={e.name}
              meta={`${e.memberUserIds.length} training · ${e.upcomingClasses} this week`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FallbackList() {
  const { entities } = useOrganization();
  return (
    <ul className="flex flex-col gap-2">
      {entities.map((e) => (
        <li key={e.id}>
          <PlainCard id={e.id} name={e.name} />
        </li>
      ))}
    </ul>
  );
}

function PlainCard({
  id,
  name,
  meta,
}: {
  id: string;
  name: string;
  meta?: string;
}) {
  return (
    <Link
      href={entityHref(id)}
      className={`${cardClass({ interactive: true })} flex items-center justify-between gap-3`}
    >
      <span className="truncate font-medium">{name}</span>
      <span className="text-muted-foreground shrink-0 text-xs">
        {meta ?? "Open"}
      </span>
    </Link>
  );
}

function waitingLabel(e: EntityRow): string {
  const parts: string[] = [];
  if (e.pendingMembers > 0) parts.push(`${e.pendingMembers} to approve`);
  if (e.newLeads > 0) parts.push(`${e.newLeads} new lead`);
  if (e.openClaims > 0) parts.push(`${e.openClaims} to confirm`);
  return parts.join(" · ");
}
