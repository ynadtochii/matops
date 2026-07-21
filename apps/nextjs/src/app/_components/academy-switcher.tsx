"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@matops/ui/dropdown-menu";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";

interface Academy {
  academyId: string;
  name: string;
}

/**
 * Multi-academy switcher (docs/issues/18). Only rendered when the user runs 2+
 * academies. Switching sets the active organization; every scoped query then
 * follows the new academy via RLS.
 */
export function AcademySwitcher({
  academies,
  activeId,
}: {
  academies: Academy[];
  activeId: string;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const setActive = useMutation(
    trpc.academy.setActive.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        router.refresh();
      },
      onError: () => toast.error("Could not switch academy"),
    }),
  );

  if (academies.length < 2) return null;

  const active = academies.find((a) => a.academyId === activeId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {active?.name ?? "Switch academy"} ▾
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {academies.map((a) => (
          <DropdownMenuItem
            key={a.academyId}
            disabled={a.academyId === activeId || setActive.isPending}
            onClick={() => setActive.mutate({ academyId: a.academyId })}
          >
            {a.name}
            {a.academyId === activeId ? " ✓" : ""}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
