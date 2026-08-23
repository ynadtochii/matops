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
  name: string;
  role: string;
  status: string;
}

/**
 * The post-login gate (ADR 49). Reached only when the session has no active
 * academy — a fresh session always starts without one. It routes the user by how
 * many academies they belong to (pending or active):
 *   - 0 → join your gym by code (new users).
 *   - 1 → open it automatically (the common case — no click).
 *   - 2+ → pick which one.
 * Creating a gym is NOT offered here; it lives behind the "Start a gym" link on
 * the landing page, because it is a rare, deliberate action.
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

  const only = list.length === 1 ? list[0] : undefined;
  if (only) {
    return <OpenActive academyId={only.academyId} name={only.name} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <PickAcademy academies={list} />
    </div>
  );
}

/** Exactly one academy → open it and land the user in context, no click. */
function OpenActive({ academyId, name }: { academyId: string; name: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  // Guard the mount effect so React 18 strict-mode's double-invoke fires it once.
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
    // Run once on mount; the mutation identity is stable enough here.
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

/** Two or more academies → let the user choose which to open. */
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
        <h1 className="text-2xl font-semibold tracking-tight">
          Choose an academy
        </h1>
        <p className="text-muted-foreground text-sm">
          You belong to a few gyms — pick the one to open.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {academies.map((a) => {
          const opening =
            setActive.isPending &&
            setActive.variables.academyId === a.academyId;
          return (
            <Button
              key={a.academyId}
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
