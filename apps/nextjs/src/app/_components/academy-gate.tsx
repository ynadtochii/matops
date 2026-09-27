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

export function AcademyGate() {
  const trpc = useTRPC();
  const memberships = useQuery(trpc.academy.memberships.queryOptions());
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
      <OpeningScreen name={target.name} id={target.organizationId} kind="gym" />
    );
  }
  if (target.kind === "openBranch") {
    return (
      <OpeningScreen name={target.name} id={target.academyId} kind="branch" />
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <JoinByCode />
    </div>
  );
}

function OpeningScreen({
  name,
  id,
  kind,
}: {
  name: string;
  id: string;
  kind: "gym" | "branch";
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const started = useRef(false);

  const setActiveGym = useMutation(
    trpc.organization.setActive.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        router.replace("/");
        router.refresh();
      },
      onError: () => toast.error("Couldn't open your gym. Try again."),
    }),
  );

  const setActiveBranch = useMutation(
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
    if (kind === "gym") {
      setActiveGym.mutate({ organizationId: id });
    } else {
      setActiveBranch.mutate({ academyId: id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
