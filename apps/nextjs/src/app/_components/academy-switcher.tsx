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

const iconProps = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "size-3.5 shrink-0",
  "aria-hidden": true,
} as const;

const ChevronDown = () => (
  <svg {...iconProps}>
    <path d="M4 6.5l4 4 4-4" />
  </svg>
);
const Check = () => (
  <svg {...iconProps}>
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);

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
          {active?.name ?? "Switch academy"}
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {academies.map((a) => {
          const current = a.academyId === activeId;
          return (
            <DropdownMenuItem
              key={a.academyId}
              aria-current={current ? "true" : undefined}
              disabled={current || setActive.isPending}
              onClick={() => setActive.mutate({ academyId: a.academyId })}
            >
              <span className="flex-1">{a.name}</span>
              {current && <Check />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
