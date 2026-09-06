"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { CreateEntityInput } from "@matops/validators";
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
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { toast } from "@matops/ui/toast";
import { CreateEntitySchema } from "@matops/validators";

import type { Organization } from "./entity";
import { useTRPC } from "~/trpc/react";
import { useOrganization } from "./entity";

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
 * what names the branch now, so the browser back button and a second tab both
 * behave. The organization overview sits at the top because an owner needs a
 * way out of one mat that does not mean choosing another.
 *
 * It says "branch" rather than "academy" because an organization can also run a
 * general space, and a gym is not a mat (ADR 126).
 */
export function EntitySelector({
  organization,
  activeId,
}: {
  organization: Organization;
  /** Left out above the branches, where "All branches" is the current place. */
  activeId?: string;
}) {
  const [adding, setAdding] = useState(false);
  const { entities, canCreateBranches } = organization;
  const active = activeId ? entities.find((e) => e.id === activeId) : undefined;
  const alone =
    activeId !== undefined && entities.length < 2 && !canCreateBranches;

  if (alone) {
    return (
      <span className="text-sidebar-foreground block truncate px-1 text-sm font-medium">
        {active?.name ?? "Your branch"}
      </span>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="max-w-full">
            <span className="truncate">{active?.name ?? "All branches"}</span>
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-52">
          <DropdownMenuItem asChild>
            <Link
              href="/overview"
              aria-current={activeId === undefined ? "true" : undefined}
            >
              <span className="flex-1">All branches</span>
              {activeId === undefined && <Check />}
            </Link>
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
          {canCreateBranches && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setAdding(true)}>
                <Plus />
                <span className="flex-1">Add branch</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AddEntityDialog
        open={adding}
        onOpenChange={setAdding}
        canCreateGeneralBranches={organization.canCreateGeneralBranches}
        branches={organization.entities}
      />
    </>
  );
}

export function AddBranchButton({
  label = "Add branch",
  primary = false,
}: {
  label?: string;
  primary?: boolean;
}) {
  const organization = useOrganization();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Button
        variant={primary ? "primary" : "outline"}
        size={primary ? "lg" : "sm"}
        onClick={() => setAdding(true)}
      >
        <Plus />
        {label}
      </Button>
      <AddEntityDialog
        open={adding}
        onOpenChange={setAdding}
        canCreateGeneralBranches={organization.canCreateGeneralBranches}
        branches={organization.entities}
      />
    </>
  );
}

function AddEntityDialog({
  open,
  onOpenChange,
  canCreateGeneralBranches,
  branches,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canCreateGeneralBranches: boolean;
  branches: { id: string; name: string }[];
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<CreateEntityInput["type"]>("bjj_academy");
  const [copyFrom, setCopyFrom] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const errorId = "entity-name-error";

  const create = useMutation(
    trpc.entity.create.mutationOptions({
      onSuccess: async (made) => {
        onOpenChange(false);
        setName("");
        setType("bjj_academy");
        setCopyFrom("");
        setNameError(null);
        await queryClient.invalidateQueries();
        router.push(entityHref(made.entityId));
      },
      onError: (e) => toast.error(e.message || "Could not add that branch"),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Add a branch</DialogTitle>
        <DialogDescription>
          It starts empty: its own schedule, roster, dues and join code.
        </DialogDescription>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = CreateEntitySchema.safeParse({
              name,
              type,
              copyFromEntityId: copyFrom === "" ? undefined : copyFrom,
            });
            if (!parsed.success) {
              setNameError("Enter a name with 2-80 characters.");
              return;
            }
            setNameError(null);
            create.mutate(parsed.data);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="entity-name">Name</Label>
            <Input
              id="entity-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              placeholder={type === "bjj_academy" ? "Second Mat" : "The Gym"}
              autoFocus
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? errorId : undefined}
            />
            {nameError && <FieldError id={errorId}>{nameError}</FieldError>}
          </div>
          {canCreateGeneralBranches ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="entity-type">Kind</Label>
              <Select
                id="entity-type"
                value={type}
                onChange={(e) =>
                  setType(e.target.value as CreateEntityInput["type"])
                }
              >
                <option value="bjj_academy">BJJ academy</option>
                <option value="general_space">
                  Other space, such as a gym or a sauna
                </option>
              </Select>
              <p className="text-muted-foreground text-sm">
                {type === "bjj_academy"
                  ? "Belts, the curriculum and referrals come with it."
                  : "A schedule, a roster and attendance. No belts or curriculum."}
              </p>
            </div>
          ) : (
            // The server refuses a general space this gym is not entitled to, so
            // offering the choice here would be a dead end (ADR 128).
            <p className="text-muted-foreground text-sm">
              This branch will be a BJJ academy, with belts, the curriculum and
              referrals. Other spaces, such as a gym floor or a sauna, are not
              switched on for your gym yet. Ask us to add them.
            </p>
          )}
          {branches.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="entity-copy">Start from</Label>
              <Select
                id="entity-copy"
                value={copyFrom}
                onChange={(e) => setCopyFrom(e.target.value)}
              >
                <option value="">Nothing, start empty</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
              <p className="text-muted-foreground text-sm">
                {copyFrom === ""
                  ? "An empty week and only you on it."
                  : "Copies the weekly schedule and the staff who run it. Members, bookings, attendance, belts and payments stay where they are."}
              </p>
            </div>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Adding…" : "Add branch"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
