"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { postLoginTarget } from "@matops/domain";
import { Logo } from "@matops/ui/logo";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { JoinByCode } from "./join-by-code";
import { PageLoader } from "./mat-loader";
import { ErrorState } from "./states";

/**
 * Better Auth writes `activeOrganizationId` when a gym is created or joined, and
 * never at sign-in, so every fresh session arrives naming no gym and every
 * organization-tier procedure refuses it. This gate is what a returning user
 * lands on: 0 gyms joins by code, otherwise the first one opens (ADR 49).
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
      <JoinByCode />
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
        router.replace("/");
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
