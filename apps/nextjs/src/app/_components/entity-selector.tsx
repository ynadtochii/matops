"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { entityHref } from "@matops/domain";
import { Button } from "@matops/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@matops/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@matops/ui/dropdown-menu";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { toast } from "@matops/ui/toast";

import type { Organization } from "./entity";
import { useTRPC } from "~/trpc/react";

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
const Plus = () => (
  <svg {...iconProps}>
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
);

/**
 * The place picker (ADR 124). Switching is a link, not a mutation: the URL is
 * what names the academy now, so the browser back button and a second tab both
 * behave. The organization overview sits at the top because an owner needs a
 * way out of one mat that does not mean choosing another.
 */
export function EntitySelector({
  organization,
  activeId,
}: {
  organization: Organization;
  activeId: string;
}) {
  const [adding, setAdding] = useState(false);
  const { entities, canAdd } = organization;
  const active = entities.find((e) => e.id === activeId);
  const alone = entities.length < 2 && !canAdd;

  if (alone) {
    return (
      <span className="text-sidebar-foreground block truncate px-1 text-sm font-medium">
        {active?.name ?? "Your academy"}
      </span>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="max-w-full">
            <span className="truncate">{active?.name ?? "Switch academy"}</span>
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-52">
          <DropdownMenuItem asChild>
            <Link href="/overview">All academies</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {entities.map((e) => {
            const current = e.id === activeId;
            return (
              <DropdownMenuItem key={e.id} asChild>
                <Link
                  href={entityHref(e.id)}
                  aria-current={current ? "true" : undefined}
                >
                  <span className="flex-1 truncate">{e.name}</span>
                  {current && <Check />}
                </Link>
              </DropdownMenuItem>
            );
          })}
          {canAdd && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setAdding(true)}>
                <Plus />
                <span className="flex-1">Add academy</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AddEntityDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}

export function AddAcademyButton() {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
        <Plus />
        Add academy
      </Button>
      <AddEntityDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}

function AddEntityDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const create = useMutation(
    trpc.entity.create.mutationOptions({
      onSuccess: async (made) => {
        onOpenChange(false);
        setName("");
        await queryClient.invalidateQueries();
        router.push(entityHref(made.entityId));
      },
      onError: (e) => toast.error(e.message || "Could not add that academy"),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Add an academy</DialogTitle>
        <DialogDescription>
          It starts empty: its own schedule, roster, dues and join code.
        </DialogDescription>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ name: name.trim(), type: "bjj_academy" });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="entity-name">Name</Label>
            <Input
              id="entity-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Second Mat"
              autoFocus
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={name.trim().length === 0 || create.isPending}
            >
              {create.isPending ? "Adding…" : "Add academy"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
