"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { Logo } from "@matops/ui/logo";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { JoinByCode } from "./join-by-code";
import { PageLoader } from "./mat-loader";
import { ErrorState } from "./states";

interface Membership {
  academyId: string;
  organizationId: string;
  name: string;
  role: string;
  status: string;
}

/**
 * Better Auth writes `activeOrganizationId` when a gym is created or joined, and
 * never at sign-in, so every fresh session arrives naming no gym and every
 * organization-tier procedure refuses it. This gate is what a returning user
 * lands on: 0 gyms joins by code, 1 opens itself, 2+ asks (ADR 49).
 */
export function AcademyGate() {
  const trpc = useTRPC();
  const memberships = useQuery(trpc.academy.memberships.queryOptions());

  if (memberships.isPending) {
    return <PageLoader label="Finding your academy" />;
  }

  if (memberships.isError) {
    return (
      <div className="mx-auto w-full max-w-md p-8">
        <ErrorState
          label="your academies"
          onRetry={() => void memberships.refetch()}
        />
      </div>
    );
  }

  const list = memberships.data;

  if (list.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <JoinByCode />
      </div>
    );
  }

  const gyms = new Map<string, Membership>();
  for (const m of list) {
    if (!gyms.has(m.organizationId)) gyms.set(m.organizationId, m);
  }
  const only = gyms.size === 1 ? [...gyms.values()][0] : undefined;

  if (only) {
    return <OpenActive academyId={only.academyId} name={only.name} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <PickAcademy academies={[...gyms.values()]} />
    </div>
  );
}

function OpenActive({ academyId, name }: { academyId: string; name: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const started = useRef(false);

  const setActive = useMutation(
    trpc.academy.setActive.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        router.refresh();
      },
      onError: () => toast.error("Could not open your academy"),
    }),
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setActive.mutate({ academyId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academyId]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Logo size={30} />
      <div className="flex items-center gap-2">
        <Spinner size="sm" />
        <span className="text-muted-foreground text-sm">Opening {name}…</span>
      </div>
    </div>
  );
}

function PickAcademy({ academies }: { academies: Membership[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const setActive = useMutation(
    trpc.academy.setActive.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        router.refresh();
      },
      onError: () => toast.error("Could not open the academy"),
    }),
  );

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8">
      <Logo size={30} />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a gym</h1>
        <p className="text-muted-foreground text-sm">
          You belong to a few gyms. Pick the one to open.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {academies.map((a) => {
          const opening =
            setActive.isPending &&
            setActive.variables.academyId === a.academyId;
          return (
            <Button
              key={a.organizationId}
              variant="outline"
              size="lg"
              className="justify-between"
              onClick={() => setActive.mutate({ academyId: a.academyId })}
              disabled={setActive.isPending}
            >
              <span className="truncate">{a.name}</span>
              {opening ? (
                <Spinner size="sm" className="text-current" />
              ) : (
                <span className="text-muted-foreground text-xs capitalize">
                  {a.status === "pending" ? "pending" : a.role}
                </span>
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
