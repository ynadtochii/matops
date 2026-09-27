"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { entityHref, timeZoneOptions } from "@matops/domain";
import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export function CreateGym({ organizationName }: { organizationName?: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const resuming = organizationName !== undefined;
  const [name, setName] = useState(organizationName ?? "");
  const [timeZone, setTimeZone] = useState(browserTimeZone);
  const zones = useMemo(() => timeZoneOptions(timeZone), [timeZone]);

  const open = async (entityId: string) => {
    await queryClient.invalidateQueries();
    router.replace(entityHref(entityId));
    router.refresh();
  };

  const createAcademy = useMutation(
    trpc.entity.create.mutationOptions({
      onSuccess: (made) => open(made.entityId),
      onError: async () => {
        toast.error("Your gym is saved, but the academy is not. Try again.");
        if (!resuming) {
          await queryClient.invalidateQueries();
          router.replace("/start");
          router.refresh();
        }
      },
    }),
  );
  const createGym = useMutation(
    trpc.organization.create.mutationOptions({
      onError: () => toast.error("Couldn't create the gym. Try again."),
    }),
  );
  const busy = createGym.isPending || createAcademy.isPending;

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {resuming ? "Finish your academy" : "Start your academy"}
        </h1>
        <p className="text-muted-foreground text-sm text-pretty">
          {resuming
            ? "Your gym is saved. Confirm the academy name and time zone to open it."
            : "Name your academy and pick its time zone. You are its owner right away."}
        </p>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (trimmed.length < 2 || busy) return;
          if (!resuming) {
            try {
              await createGym.mutateAsync({ name: trimmed });
            } catch {
              return;
            }
          }
          createAcademy.mutate({
            name: trimmed,
            type: "bjj_academy",
            timeZone,
          });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gym-name">Academy name</Label>
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gym-time-zone">Time zone</Label>
          <Select
            id="gym-time-zone"
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value)}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" size="lg" disabled={busy} busy={busy}>
          {resuming ? "Open academy" : "Create academy"}
        </Button>
      </form>
    </div>
  );
}
