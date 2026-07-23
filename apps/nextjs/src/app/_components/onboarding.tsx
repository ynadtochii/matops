"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Logo } from "@matops/ui/logo";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";

interface Academy {
  academyId: string;
  name: string;
}

/**
 * "Start a gym" (spec 1.1). Creating an academy makes you its active owner at
 * once (the afterCreateOrganization hook activates the creator). If the user
 * already belongs to academies but none is active, they can open one instead.
 */
export function Onboarding({ academies = [] }: { academies?: Academy[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const create = useMutation(
    trpc.academy.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        router.refresh();
      },
      onError: () => toast.error("Could not create the academy"),
    }),
  );

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
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Start a gym</h1>
        <p className="text-muted-foreground text-sm">
          Create your academy — you&apos;ll be its owner right away, no approval
          needed.
        </p>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2) create.mutate({ name: name.trim() });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="academy-name">Academy name</Label>
            <Input
              id="academy-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Gracie Barra HQ"
              minLength={2}
              maxLength={80}
              required
            />
          </div>
          <Button type="submit" size="lg" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create academy"}
          </Button>
        </form>
      </div>

      {academies.length > 0 && (
        <div className="flex flex-col gap-2 border-t pt-6">
          <p className="text-muted-foreground text-sm">
            Or open an academy you belong to:
          </p>
          {academies.map((a) => {
            const opening =
              setActive.isPending &&
              setActive.variables.academyId === a.academyId;
            return (
              <Button
                key={a.academyId}
                variant="outline"
                onClick={() => setActive.mutate({ academyId: a.academyId })}
                disabled={setActive.isPending}
              >
                {opening ? "Opening…" : a.name}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
