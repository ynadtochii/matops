"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Ellipsis, Plus } from "lucide-react";

import { Button } from "@matops/ui/button";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@matops/ui/popover";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";

interface Item {
  id: string;
  name: string;
}

export function DisciplineManager({
  items,
  selected,
  onSelect,
  canManage,
  unavailable,
  disabled,
}: {
  items: Item[];
  selected: string;
  onSelect: (name: string) => void;
  canManage: boolean;
  unavailable: boolean;
  disabled: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"rename" | "delete" | null>(null);

  const reset = () => {
    setAdding(false);
    setEditing(null);
    setDraft("");
    setError(null);
    setConfirm(null);
  };
  const close = () => {
    setOpen(false);
    reset();
  };
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries(trpc.discipline.list.pathFilter()),
      queryClient.invalidateQueries(trpc.template.list.pathFilter()),
      queryClient.invalidateQueries(trpc.class.pathFilter()),
    ]);
  };
  const add = useMutation(
    trpc.discipline.add.mutationOptions({
      onSuccess: async (item) => {
        onSelect(item.name);
        reset();
        await invalidate();
        toast.success("Discipline added");
      },
      onError: (err) => setError(err.message),
    }),
  );
  const rename = useMutation(
    trpc.discipline.rename.mutationOptions({
      onSuccess: async (item) => {
        if (selected === editing?.name) onSelect(item.name);
        reset();
        await invalidate();
        toast.success("Discipline renamed");
      },
      onError: (err) => {
        setConfirm(null);
        setError(err.message);
      },
    }),
  );
  const remove = useMutation(
    trpc.discipline.remove.mutationOptions({
      onSuccess: async () => {
        if (selected === editing?.name) onSelect("");
        reset();
        await invalidate();
        toast.success("Discipline deleted");
      },
      onError: (err) => {
        setConfirm(null);
        setError(err.message);
      },
    }),
  );
  const busy = add.isPending || rename.isPending || remove.isPending;

  const save = () => {
    const name = draft.trim();
    if (!name) {
      setError("Enter a discipline name.");
      input.current?.focus();
      return;
    }
    setError(null);
    if (editing) {
      if (name === editing.name) {
        reset();
        return;
      }
      setConfirm("rename");
    } else {
      add.mutate({ name });
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id="tpl-discipline"
          disabled={disabled}
          aria-label={`Discipline: ${selected || "None"}`}
          aria-invalid={unavailable || undefined}
          aria-describedby={
            unavailable ? "tpl-discipline-unavailable" : undefined
          }
          className="border-input bg-raised text-foreground hover:border-field-hover focus-visible:border-ring focus-visible:ring-ring-halo aria-invalid:border-error flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md border px-2.5 text-left text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8"
        >
          <span className="truncate">{selected || "None"}</span>
          <ChevronDown
            aria-hidden="true"
            className="text-muted-foreground size-4 shrink-0"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Choose discipline"
        className="w-(--radix-popover-trigger-width)"
      >
        {editing || adding ? (
          <div className="space-y-3 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {editing ? `Edit ${editing.name}` : "Add discipline"}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={reset}
              >
                Back
              </Button>
            </div>
            {!confirm && (
              <>
                <Label htmlFor="tpl-discipline-name">Name</Label>
                <Input
                  id="tpl-discipline-name"
                  ref={input}
                  autoFocus
                  value={draft}
                  maxLength={40}
                  disabled={busy}
                  aria-invalid={!!error}
                  aria-describedby={
                    error ? "tpl-discipline-name-error" : undefined
                  }
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      save();
                    }
                  }}
                />
                {error && (
                  <FieldError id="tpl-discipline-name-error">
                    {error}
                  </FieldError>
                )}
                <div className="flex justify-end gap-2">
                  {editing && (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive-outline"
                      disabled={busy}
                      onClick={() => setConfirm("delete")}
                    >
                      Delete
                    </Button>
                  )}
                  <Button type="button" size="sm" busy={busy} onClick={save}>
                    {editing ? "Rename" : "Save"}
                  </Button>
                </div>
              </>
            )}
            {confirm && editing && (
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">
                  {confirm === "rename"
                    ? `Rename ${editing.name} to ${draft.trim()}? This changes matching templates and future scheduled classes, including one-offs. Past and cancelled classes keep their saved discipline.`
                    : `Delete ${editing.name}? This clears it from matching templates and future scheduled classes, including one-offs. Past and cancelled classes keep their saved discipline.`}
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setConfirm(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={confirm === "delete" ? "destructive" : "primary"}
                    busy={busy}
                    onClick={() => {
                      if (confirm === "rename")
                        rename.mutate({ id: editing.id, name: draft.trim() });
                      else remove.mutate({ id: editing.id });
                    }}
                  >
                    {confirm === "delete"
                      ? "Delete discipline"
                      : "Rename discipline"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                onSelect("");
                close();
              }}
              className="hover:bg-hover focus-visible:bg-active flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none sm:min-h-8"
            >
              <Check
                aria-hidden="true"
                className={`size-4 shrink-0 ${selected === "" ? "opacity-100" : "opacity-0"}`}
              />
              None
            </button>
            {items.map((item) => (
              <div
                key={item.id}
                className="hover:bg-hover flex items-center rounded-md"
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(item.name);
                    close();
                  }}
                  className="focus-visible:bg-active flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm outline-none sm:min-h-8"
                >
                  <Check
                    aria-hidden="true"
                    className={`size-4 shrink-0 ${selected === item.name ? "opacity-100" : "opacity-0"}`}
                  />
                  <span className="truncate">{item.name}</span>
                </button>
                {canManage && (
                  <button
                    type="button"
                    aria-label={`Edit ${item.name}`}
                    onClick={() => {
                      setEditing(item);
                      setDraft(item.name);
                      setError(null);
                    }}
                    className="text-muted-foreground hover:text-foreground focus-visible:bg-active flex size-11 shrink-0 items-center justify-center rounded-md outline-none sm:size-8"
                  >
                    <Ellipsis aria-hidden="true" className="size-4" />
                  </button>
                )}
              </div>
            ))}
            {canManage && (
              <>
                <div className="bg-border mx-1 my-1 h-px" />
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="text-foreground hover:bg-hover focus-visible:bg-active flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none sm:min-h-8"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Add discipline
                </button>
              </>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
