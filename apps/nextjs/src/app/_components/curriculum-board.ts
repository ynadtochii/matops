"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addDays,
  groupByCategory,
  insertPlacement,
  movePlacement,
  placementState,
  removePlacement,
  rippleFrom,
} from "@matops/domain";
import { toast } from "@matops/ui/toast";

import type { Board, Placed } from "./curriculum-shared";
import { optimistic, rollback } from "~/lib/optimistic";
import { useTRPC } from "~/trpc/react";
import {
  dayLabel,
  movedLabel,
  slotLabel,
  weeksLabel,
} from "./curriculum-shared";

interface BlockDraft {
  theme: string;
  notes: string;
  category: string;
  defaultWeeks: number;
}

interface PlaceRequest {
  blockId: string;
  atIndex: number;
  weeks?: number;
  slotId?: string;
  note?: string | null;
}

/**
 * Everything the curriculum screen does to the server, plus the cache rewrite
 * each change implies. The sequencing four (place, resize, move, unplace) are
 * optimistic and fire-and-forget, so the timeline redraws under the pointer;
 * everything a dialog waits on returns a promise, and the dialog closes itself.
 */
export function useCurriculumBoard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [trackId, setTrackId] = useState<string | null>(null);

  const input = trackId ? { trackId } : {};
  const query = useQuery(trpc.curriculum.board.queryOptions(input));
  const key = trpc.curriculum.board.queryKey(input);

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.curriculum.board.pathFilter());
  const onError = (err: { message: string }) =>
    toast.error(err.message || "Action failed");

  const replan = (next: (current: Board) => Placed[]) =>
    optimistic(queryClient, key, (current) => ({
      ...current,
      plan: next(current).map((p) => ({
        ...p,
        state: placementState(p, current.today),
      })),
    }));

  const undoable = {
    onError: (err: { message: string }, _vars: unknown, ctx: unknown) => {
      rollback(queryClient, ctx as Parameters<typeof rollback>[1]);
      onError(err);
    },
    onSettled: () => invalidate(),
  };

  const plan = useMemo(() => query.data?.plan ?? [], [query.data]);
  const blocks = useMemo(() => query.data?.blocks ?? [], [query.data]);
  const tracks = useMemo(() => query.data?.tracks ?? [], [query.data]);
  const groups = useMemo(() => groupByCategory(blocks), [blocks]);

  const resize = useMutation(
    trpc.curriculum.resize.mutationOptions({
      onMutate: (vars) =>
        replan((current) => {
          const index = current.plan.findIndex((p) => p.id === vars.slotId);
          return index === -1
            ? current.plan
            : rippleFrom(current.plan, index, vars.weeks);
        }),
      onSuccess: (data, vars) => {
        const slot = plan.find((p) => p.id === vars.slotId);
        const theme = slot ? slotLabel(slot) : "The block";
        toast.success(`${theme} now runs ${weeksLabel(vars.weeks)}.`, {
          description: `${movedLabel(data.moved)} The plan now ends ${dayLabel(data.endsOn)}.`,
          action: {
            label: "Undo",
            onClick: () =>
              resize.mutate({ slotId: vars.slotId, weeks: data.previousWeeks }),
          },
        });
      },
      ...undoable,
    }),
  );

  const move = useMutation(
    trpc.curriculum.move.mutationOptions({
      onMutate: (vars) =>
        replan((current) => {
          const index = current.plan.findIndex((p) => p.id === vars.slotId);
          return index === -1
            ? current.plan
            : movePlacement(current.plan, index, vars.toIndex);
        }),
      onSuccess: (data, vars) => {
        const slot = plan.find((p) => p.id === vars.slotId);
        const theme = slot ? slotLabel(slot) : "The block";
        toast.success(`Moved ${theme}.`, {
          description: `The plan now ends ${dayLabel(data.endsOn)}.`,
          action: {
            label: "Undo",
            onClick: () =>
              move.mutate({ slotId: vars.slotId, toIndex: data.fromIndex }),
          },
        });
      },
      ...undoable,
    }),
  );

  const place = useMutation(
    trpc.curriculum.place.mutationOptions({
      onMutate: (vars) =>
        replan((current) => {
          const block = current.blocks.find((b) => b.id === vars.blockId);
          if (!block) return current.plan;
          const pending = {
            placementId: `pending-${block.id}`,
            templateId: block.id,
            theme: block.theme,
            notes: block.notes,
            note: vars.note ?? null,
          };
          if (vars.slotId) {
            return current.plan.map((p) =>
              p.id === vars.slotId
                ? { ...p, themes: [...p.themes, pending] }
                : p,
            );
          }
          const weeks = vars.weeks ?? block.defaultWeeks;
          return insertPlacement(
            current.plan,
            vars.atIndex,
            {
              id: `pending-${block.id}`,
              startsOn: current.today,
              endsOn: addDays(current.today, weeks * 7 - 1),
              weeks,
              themes: [pending],
              state: "draft",
            },
            current.today,
          );
        }),
      onSuccess: (data, vars) => {
        if (vars.slotId) {
          toast.success(`${data.theme} runs on those weeks too.`);
          return;
        }
        toast.success(`${data.theme} is on the plan.`, {
          description: `${movedLabel(data.moved)} The plan now ends ${dayLabel(data.endsOn)}.`,
          action: {
            label: "Undo",
            onClick: () => unplace.mutate({ slotId: data.slotId }),
          },
        });
      },
      ...undoable,
    }),
  );

  const unplace = useMutation(
    trpc.curriculum.unplace.mutationOptions({
      onMutate: (vars) =>
        replan((current) => {
          const index = current.plan.findIndex((p) => p.id === vars.slotId);
          return index === -1
            ? current.plan
            : removePlacement(current.plan, index);
        }),
      onSuccess: (_data, vars) => {
        const gone = plan.find((p) => p.id === vars.slotId);
        const index = plan.findIndex((p) => p.id === vars.slotId);
        if (!gone) return;
        const only = gone.themes.length === 1 ? gone.themes[0] : null;
        toast.success(`${slotLabel(gone)} is off the plan.`, {
          description: "The blocks after it moved up.",
          action: only
            ? {
                label: "Undo",
                onClick: () =>
                  placeBlock({
                    blockId: only.templateId,
                    atIndex: index,
                    weeks: gone.weeks,
                    note: only.note,
                  }),
              }
            : undefined,
        });
      },
      ...undoable,
    }),
  );

  const removeTheme = useMutation(
    trpc.curriculum.removeTheme.mutationOptions({
      onMutate: (vars) =>
        replan((current) =>
          current.plan.map((p) => ({
            ...p,
            themes: p.themes.filter(
              (on) => on.placementId !== vars.placementId,
            ),
          })),
        ),
      onSuccess: () => toast.success("Taken off those weeks."),
      ...undoable,
    }),
  );

  const setRunNote = useMutation(
    trpc.curriculum.setRunNote.mutationOptions({
      onMutate: (vars) =>
        replan((current) =>
          current.plan.map((p) => ({
            ...p,
            themes: p.themes.map((on) =>
              on.placementId === vars.placementId
                ? { ...on, note: vars.note?.length ? vars.note : null }
                : on,
            ),
          })),
        ),
      onSuccess: (_data, vars) =>
        toast.success(
          vars.note?.length ? "Saved for this run." : "Note cleared.",
        ),
      ...undoable,
    }),
  );

  const createTrack = useMutation(
    trpc.curriculum.createTrack.mutationOptions({
      onSuccess: async (data) => {
        setTrackId(data.id);
        await invalidate();
        toast.success("Track added.");
      },
      onError,
    }),
  );

  const renameTrack = useMutation(
    trpc.curriculum.renameTrack.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Track renamed.");
      },
      onError,
    }),
  );

  const deleteTrack = useMutation(
    trpc.curriculum.deleteTrack.mutationOptions({
      onSuccess: async (data) => {
        setTrackId(null);
        await invalidate();
        toast.success("Track removed. Your blocks are still in the library.", {
          description: data.detached
            ? `${data.detached} ${data.detached === 1 ? "class" : "classes"} went back to the default track.`
            : undefined,
        });
      },
      onError,
    }),
  );

  const createBlock = useMutation(
    trpc.curriculum.createBlock.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Block added to your library");
      },
      onError,
    }),
  );

  const updateBlock = useMutation(
    trpc.curriculum.updateBlock.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Block updated");
      },
      onError,
    }),
  );

  const deleteBlock = useMutation(
    trpc.curriculum.deleteBlock.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Block deleted");
      },
      onError,
    }),
  );

  const activeTrackId = query.data?.activeTrackId ?? null;

  const placeBlock = (vars: PlaceRequest) => {
    if (!activeTrackId) return;
    place.mutate({ ...vars, trackId: activeTrackId });
  };

  return {
    query,
    plan,
    blocks,
    groups,
    tracks,
    activeTrackId,
    activeTrack: tracks.find((t) => t.id === activeTrackId) ?? null,
    categories: query.data?.categories ?? [],
    today: query.data?.today ?? "",
    editFloor: query.data?.firstEditableIndex ?? 0,
    selectTrack: setTrackId,
    /** A sequencing write is in flight, so the timeline must not be grabbed again. */
    busy:
      resize.isPending ||
      move.isPending ||
      place.isPending ||
      unplace.isPending ||
      removeTheme.isPending,
    savingBlock: createBlock.isPending || updateBlock.isPending,
    savingTrack: createTrack.isPending || renameTrack.isPending,
    savingRunNote: setRunNote.isPending,
    actions: {
      place: placeBlock,
      resize: (slotId: string, weeks: number) =>
        resize.mutate({ slotId, weeks }),
      move: (slotId: string, toIndex: number) =>
        move.mutate({ slotId, toIndex }),
      unplace: (slotId: string) => unplace.mutate({ slotId }),
      removeTheme: (placementId: string) => removeTheme.mutate({ placementId }),
      setRunNote: (placementId: string, note: string) =>
        setRunNote.mutateAsync({ placementId, note }),
      createTrack: (name: string) => createTrack.mutateAsync({ name }),
      renameTrack: (id: string, name: string) =>
        renameTrack.mutateAsync({ id, name }),
      deleteTrack: (id: string) => deleteTrack.mutateAsync({ id }),
      createBlock: (draft: BlockDraft) => createBlock.mutateAsync(draft),
      updateBlock: (id: string, draft: BlockDraft) =>
        updateBlock.mutateAsync({ id, ...draft }),
      deleteBlock: (blockId: string) => deleteBlock.mutateAsync({ blockId }),
    },
  };
}
