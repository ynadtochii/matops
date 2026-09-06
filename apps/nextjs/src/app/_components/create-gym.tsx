"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";

/**
 * "Start a gym" (spec FP1). Its own deliberate step (ADR 49), reached from the
 * "Start a gym" link on the landing page, not shown to everyone after login.
 * It creates the gym and no branch (ADR 128): the owner is its active owner at
 * once and picks the first branch afterwards.
 */
export function CreateGym() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const create = useMutation(
    trpc.organization.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        router.replace("/overview");
        router.refresh();
      },
      onError: () => toast.error("Could not create the gym"),
    }),
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Start a gym</h1>
        <p className="text-muted-foreground text-sm">
          Name your gym. You are its owner right away, no approval needed. You
          add your first branch next.
        </p>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length >= 2) create.mutate({ name: name.trim() });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gym-name">Gym name</Label>
          <Input
            id="gym-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Gracie Barra"
            minLength={2}
            maxLength={80}
            required
          />
        </div>
        <Button type="submit" size="lg" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create gym"}
        </Button>
      </form>
    </div>
  );
}
