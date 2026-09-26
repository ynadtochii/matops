"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { LIST, SectionHeading, SettingsRow } from "./primitives";

/**
 * Branch identity (spec O6). The **name** is a label the owner can rename; the
 * **join code** is the permanent identifier students type to find the gym.
 * Renaming updates every screen that reads the branch (sidebar, switcher) via
 * an `academy` path invalidation; the join code never changes.
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

  const rename = useMutation(
    trpc.academy.rename.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.academy.pathFilter());
        toast.success("Branch renamed");
        setEditing(false);
      },
      onError: () => {
        const message = "Couldn't rename the branch. Try again.";
        setNameError(message);
        toast.error(message);
      },
    }),
  );

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
    rename.mutate({ name: next });
  };

  return (
    <section className="flex flex-col gap-4">
      <SectionHeading>Name and join code</SectionHeading>
      <div className={LIST}>
        <SettingsRow
          title="Branch name"
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
                aria-label="Branch name"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "branch-name-error" : undefined}
              />
              <Button size="sm" busy={rename.isPending} onClick={save}>
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
