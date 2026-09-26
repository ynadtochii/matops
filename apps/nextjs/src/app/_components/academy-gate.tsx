"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import { postLoginTarget } from "@matops/domain";
import { Badge } from "@matops/ui/badge";
import { Button } from "@matops/ui/button";
import { Logo } from "@matops/ui/logo";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { JoinByCode } from "./join-by-code";
import { PageLoader } from "./mat-loader";
import { ErrorState } from "./states";

type BranchChoice = RouterOutputs["academy"]["memberships"][number];

/**
 * Better Auth writes `activeOrganizationId` when a gym is created or joined, and
 * never at sign-in, so every fresh session arrives naming no gym and every
 * organization-tier procedure refuses it. This gate is what a returning user
 * lands on: 0 gyms joins by code, 1 opens itself, 2+ asks (ADR 49).
 */
export function AcademyGate() {
  const trpc = useTRPC();
  const memberships = useQuery(trpc.academy.memberships.queryOptions());
  // An owner whose gym has no branch belongs to no branch, so the list above is
  // empty for them and the join screen would be the wrong answer (ADR 128).
  const owned = useQuery({
    ...trpc.organization.mine.queryOptions(),
    enabled: memberships.data?.length === 0,
  });

  if (memberships.isPending) {
    return <PageLoader label="Finding your gym" />;
  }

  if (memberships.isError) {
    return (
      <div className="mx-auto w-full max-w-md p-8">
        <ErrorState
          label="your gym"
          onRetry={() => void memberships.refetch()}
        />
      </div>
    );
  }

  const list = memberships.data;
  if (list.length === 0 && owned.isPending) {
    return <PageLoader label="Finding your gym" />;
  }

  const target = postLoginTarget(list, owned.data ?? []);

  if (target.kind === "openGym") {
    return (
      <OpenGym organizationId={target.organizationId} name={target.name} />
    );
  }
  if (target.kind === "openBranch") {
    return <OpenActive academyId={target.academyId} name={target.name} />;
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      {target.kind === "pick" ? (
        <PickAcademy academies={target.gyms} />
      ) : (
        <JoinByCode />
      )}
    </div>
  );
}

function OpenGym({
  organizationId,
  name,
}: {
  organizationId: string;
  name: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const started = useRef(false);

  const setActive = useMutation(
    trpc.organization.setActive.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        router.replace("/overview");
        router.refresh();
      },
      onError: () => toast.error("Couldn't open your gym. Try again."),
    }),
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setActive.mutate({ organizationId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

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
      onError: () => toast.error("Couldn't open your branch. Try again."),
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

function PickAcademy({ academies }: { academies: BranchChoice[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const setActive = useMutation(
    trpc.academy.setActive.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        router.refresh();
      },
      onError: () => toast.error("Couldn't open the branch. Try again."),
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
                <Badge tone="neutral" className="capitalize">
                  {a.status === "pending" ? "pending" : a.role}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
