"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";

/**
 * Academy identity (spec O6) — the **name** is a mutable label the owner can
 * rename; the **code** is the immutable, unique identifier students join with.
 * Renaming updates every screen that reads the academy (sidebar, switcher) via
 * an `academy` path invalidation; the code never changes.
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

  const rename = useMutation(
    trpc.academy.rename.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.academy.pathFilter());
        toast.success("Academy renamed");
        setEditing(false);
      },
      onError: () => toast.error("Could not rename the academy"),
    }),
  );

  const save = () => {
    const next = draft.trim();
    if (next.length < 2) {
      toast.error("Name must be at least 2 characters");
      return;
    }
    if (next === name) {
      setEditing(false);
      return;
    }
    rename.mutate({ name: next });
  };

  return (
    <section className="border-border flex flex-col divide-y rounded-lg border">
      {/* Academy name — editable label */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        {editing ? (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={80}
              autoFocus
              className="max-w-xs"
              aria-label="Academy name"
            />
            <Button size="sm" onClick={save} disabled={rename.isPending}>
              {rename.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(name);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <div>
              <p className="text-muted-foreground text-sm">Academy name</p>
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

      {/* Academy code — permanent identifier */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-medium">Academy code</p>
          <p className="text-muted-foreground text-sm">
            Students type this into the app to join. Permanent — it never changes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-2xl tracking-[0.2em] tabular-nums">
            {code}
          </span>
          {code && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(code);
                toast.success("Code copied");
              }}
            >
              Copy
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
