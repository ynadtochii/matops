"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { useOrganization } from "./entity";
import { LIST, SectionHeading, SettingsRow } from "./primitives";

/**
 * Academy identity (spec O6). With one academy the gym and the academy are the
 * same place to the owner, so a rename writes both names and they cannot drift.
 * The join code never changes.
 */
export function AcademyIdentity({
  name,
  code,
}: {
  name: string;
  code: string | null | undefined;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [nameError, setNameError] = useState<string | null>(null);
  const { entities, canRunOrganization } = useOrganization();
  const renameGymToo = canRunOrganization && entities.length === 1;

  const renameAcademy = useMutation(trpc.academy.rename.mutationOptions());
  const renameGym = useMutation(trpc.organization.rename.mutationOptions());
  const renaming = renameAcademy.isPending || renameGym.isPending;

  const rename = async (next: string) => {
    try {
      await renameAcademy.mutateAsync({ name: next });
      if (renameGymToo) await renameGym.mutateAsync({ name: next });
      await Promise.all([
        queryClient.invalidateQueries(trpc.academy.pathFilter()),
        queryClient.invalidateQueries(trpc.entity.pathFilter()),
      ]);
      toast.success("Academy renamed");
      setEditing(false);
    } catch {
      const message = "Couldn't rename the academy. Try again.";
      setNameError(message);
      toast.error(message);
    }
  };

  const save = () => {
    const next = draft.trim();
    if (next.length < 2) {
      setNameError("Use at least 2 characters.");
      return;
    }
    setNameError(null);
    if (next === name) {
      setEditing(false);
      return;
    }
    void rename(next);
  };

  return (
    <section className="flex flex-col gap-4">
      <SectionHeading>Name and join code</SectionHeading>
      <div className={LIST}>
        <SettingsRow
          title="Academy name"
          description={
            editing ? undefined : (
              <span className="text-foreground text-md">{name}</span>
            )
          }
        >
          {editing ? (
            <>
              <Input
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setNameError(null);
                }}
                maxLength={80}
                autoFocus
                className="w-full sm:w-56"
                aria-label="Academy name"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "branch-name-error" : undefined}
              />
              <Button size="sm" busy={renaming} onClick={save}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(name);
                  setNameError(null);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              {nameError && (
                <FieldError id="branch-name-error" className="basis-full">
                  {nameError}
                </FieldError>
              )}
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(name);
                setEditing(true);
              }}
            >
              Rename
            </Button>
          )}
        </SettingsRow>

        <SettingsRow
          title="Join code"
          description="Students type this code into the app to join. It never changes."
        >
          <span className="font-mono text-xl tracking-[0.2em] tabular-nums">
            {code}
          </span>
          {code && <CopyButton value={code} toastMessage="Code copied" />}
        </SettingsRow>
      </div>
    </section>
  );
}
