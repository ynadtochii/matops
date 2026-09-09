"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";

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
      onError: () => toast.error("Couldn't rename the branch. Try again."),
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
    <section className="border-border flex flex-col divide-y rounded-lg border">
      {/* The branch name, edited in place. */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        {editing ? (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setNameError(null);
              }}
              maxLength={80}
              autoFocus
              className="max-w-xs"
              aria-label="Branch name"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "branch-name-error" : undefined}
            />
            <Button size="sm" onClick={save} disabled={rename.isPending}>
              {rename.isPending ? "Saving…" : "Save"}
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
          </div>
        ) : (
          <>
            <div>
              <p className="text-muted-foreground text-sm">Branch name</p>
              <p className="text-base font-medium">{name}</p>
            </div>
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
          </>
        )}
      </div>

      {/* Join code: a permanent identifier */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-medium">Join code</p>
          <p className="text-muted-foreground text-sm">
            Students type this code into the app to join. It never changes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xl tracking-[0.2em] tabular-nums sm:text-2xl">
            {code}
          </span>
          {code && <CopyButton value={code} toastMessage="Code copied" />}
        </div>
      </div>
    </section>
  );
}
