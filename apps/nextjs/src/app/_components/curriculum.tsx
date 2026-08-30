"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  addDays,
  daysBetween,
  isoWeek,
  MAX_BLOCK_WEEKS,
  MAX_SLOT_BLOCKS,
  mondayOf,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@matops/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@matops/ui/dropdown-menu";
import { toast } from "@matops/ui/toast";

import type { BlockForm, RunNoteForm, TrackForm } from "./curriculum-dialogs";
import type { Block, Placed, Theme } from "./curriculum-shared";
import { monthShortFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useAcademy } from "./academy";
import { useCurriculumBoard } from "./curriculum-board";
import { BlockDialog, RunNoteDialog, TrackDialog } from "./curriculum-dialogs";
import { useTimelineDrag } from "./curriculum-drag";
import {
  BLANK_WEEKS,
  chipClass,
  CONTROL,
  dayDate,
  dayLabel,
  EMPTY_WEEKS,
  GAP,
  GHOST,
  GRIP,
  ICON_BTN,
  MIN_WEEKS,
  slotLabel,
  STEP,
  SURFACE,
  WEEK_H,
  weeksLabel,
} from "./curriculum-shared";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ENTER,
  GripIcon,
  MinusIcon,
  MoreIcon,
  NoteIcon,
  PencilIcon,
  PlusIcon,
  SectionHeading,
  XIcon,
} from "./primitives";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";

function blockForm(block: Block): BlockForm {
  return {
    id: block.id,
    theme: block.theme,
    defaultWeeks: block.defaultWeeks,
    notes: block.notes ?? "",
    category: block.category ?? "",
    creating: false,
  };
}

/** Close a dialog once the write lands. A refusal keeps it open; `onError` toasts. */
function closeWhenSaved(work: Promise<unknown>, close: () => void) {
  void work.then(close, () => undefined);
}

export function Curriculum() {
  const board = useCurriculumBoard();
  const {
    plan,
    blocks,
    groups,
    tracks,
    categories,
    today,
    editFloor,
    activeTrackId,
    actions,
  } = board;

  const [form, setForm] = useState<BlockForm | null>(null);
  const [runForm, setRunForm] = useState<RunNoteForm | null>(null);
  const [trackForm, setTrackForm] = useState<TrackForm | null>(null);
  const [trackDelete, setTrackDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());

  const anchor = useMemo(() => {
    const first = plan[0]?.startsOn;
    if (!today) return "";
    return mondayOf(!first || today < first ? today : first);
  }, [plan, today]);

  const {
    rail,
    preview,
    dropAt,
    dropInto,
    holding,
    startPlace,
    startMove,
    startResize,
    surface,
  } = useTimelineDrag({
    plan,
    today,
    anchor,
    editFloor,
    enabled: !board.busy,
    onPlace: (blockId, atIndex, slotId) =>
      actions.place({ blockId, atIndex, slotId }),
    onMove: actions.move,
    onResize: actions.resize,
  });

  const shown = preview ?? plan;
  const bare = groups.length === 1 && groups[0]?.category === null;

  const layout = useMemo(
    () =>
      shown.map((p) => ({
        top: Math.round(daysBetween(anchor, p.startsOn) * (WEEK_H / 7)),
        height: p.weeks * WEEK_H - GAP,
      })),
    [shown, anchor],
  );

  const weeksShown = useMemo(() => {
    const last = shown.at(-1);
    const planned = last
      ? Math.ceil((daysBetween(anchor, last.endsOn) + 1) / 7)
      : 0;
    return Math.max(
      planned + BLANK_WEEKS,
      shown.length ? MIN_WEEKS : EMPTY_WEEKS,
    );
  }, [shown, anchor]);

  const ticks = useMemo(() => {
    const rows: { week: number; label: string | null }[] = [];
    let month: string | null = null;
    for (let w = 0; w < weeksShown; w++) {
      const at = addDays(anchor, w * 7);
      const label = monthShortFmt.format(dayDate(at)).toUpperCase();
      rows.push({ week: isoWeek(at), label: label === month ? null : label });
      month = label;
    }
    return rows;
  }, [anchor, weeksShown]);

  const canvas = weeksShown * WEEK_H;

  const nowTop =
    anchor && today >= anchor
      ? Math.round(daysBetween(anchor, today) * (WEEK_H / 7))
      : null;

  const submitBlock = () => {
    if (!form) return;
    const theme = form.theme.trim();
    if (!theme) {
      toast.error("Give the block a theme");
      return;
    }
    const draft = {
      theme,
      notes: form.notes.trim(),
      category: form.category.trim(),
      defaultWeeks: form.defaultWeeks,
    };
    closeWhenSaved(
      form.id
        ? actions.updateBlock(form.id, draft)
        : actions.createBlock(draft),
      () => setForm(null),
    );
  };

  return (
    <section className="flex flex-col gap-6" {...surface}>
      <SectionHeading
        action={
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
            <StudentVisibility />
            <Button
              size="sm"
              onClick={() =>
                setForm({
                  id: null,
                  theme: "",
                  defaultWeeks: 2,
                  notes: "",
                  category: "",
                  creating: false,
                })
              }
            >
              New block
            </Button>
          </div>
        }
      >
        Curriculum
      </SectionHeading>

      <p className="text-muted-foreground max-w-prose text-sm">
        Stretches follow one after another, so changing one moves everything
        after it. Weeks that already ran stay where they are. Drop a block onto
        a stretch that is already on the plan and the two run together, up to{" "}
        {MAX_SLOT_BLOCKS} on the same weeks. Your blocks are shared by every
        track.
      </p>

      {tracks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {tracks.map((t) =>
            t.id === activeTrackId ? (
              <div
                key={t.id}
                className={cn(
                  chipClass(true),
                  "flex items-stretch py-0 pr-0 pl-3",
                )}
              >
                <span className="self-center py-1.5">{t.name}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Rename or delete ${t.name}`}
                      className={cn(
                        "hover:bg-primary-foreground/15 ml-1 grid place-items-center rounded-r-md px-2",
                        SURFACE,
                      )}
                    >
                      <MoreIcon />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onSelect={() => setTrackForm({ id: t.id, name: t.name })}
                    >
                      Rename track
                    </DropdownMenuItem>
                    {!t.isDefault && (
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() =>
                          setTrackDelete({ id: t.id, name: t.name })
                        }
                      >
                        Delete track
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <button
                key={t.id}
                type="button"
                className={chipClass(false)}
                onClick={() => board.selectTrack(t.id)}
              >
                {t.name}
              </button>
            ),
          )}
          <button
            type="button"
            className={chipClass(false)}
            onClick={() => setTrackForm({ id: null, name: "" })}
          >
            + New track
          </button>
        </div>
      )}

      <ConfirmDialog
        open={trackDelete !== null}
        onOpenChange={(next) => !next && setTrackDelete(null)}
        title={`Delete ${trackDelete?.name ?? "this track"}?`}
        description="Its plan goes with it. Classes that followed it go back to the default track, and your blocks stay in the library."
        confirmLabel="Delete track"
        onConfirm={async () => {
          if (trackDelete) await actions.deleteTrack(trackDelete.id);
          setTrackDelete(null);
        }}
      />

      {board.query.isPending ? (
        <SkeletonRows rows={4} />
      ) : board.query.isError ? (
        <ErrorState
          label="the curriculum"
          onRetry={() => void board.query.refetch()}
        />
      ) : (
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-6">
          <div className={cn("lg:order-2 lg:w-80 lg:shrink-0 xl:w-96", ENTER)}>
            <h3 className="font-mono text-[11px] font-medium tracking-[0.16em] uppercase">
              Blocks
            </h3>
            {blocks.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">
                No blocks yet. Add the themes your gym works through, then drag
                them onto the timeline.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {groups.map((group) => {
                  const cards = (
                    <ul className="flex flex-col gap-2">
                      {group.blocks.map((block) => (
                        <LibraryCard
                          key={block.id}
                          block={block}
                          flags={{
                            busy: board.busy,
                            held:
                              holding?.kind === "new" &&
                              holding.id === block.id,
                          }}
                          on={{
                            grab: (e) => startPlace(e, block),
                            add: () =>
                              actions.place({
                                blockId: block.id,
                                atIndex: plan.length,
                              }),
                            edit: () => setForm(blockForm(block)),
                            delete: () => actions.deleteBlock(block.id),
                          }}
                        />
                      ))}
                    </ul>
                  );
                  if (bare) return <div key="all">{cards}</div>;
                  const name = group.category ?? "";
                  const open = opened.has(name);
                  return (
                    <Collapsible
                      key={name}
                      className="border-border bg-muted/20 rounded-lg border px-3 py-1"
                      open={open}
                      onOpenChange={(next) =>
                        setOpened((was) => {
                          const now = new Set(was);
                          if (next) now.add(name);
                          else now.delete(name);
                          return now;
                        })
                      }
                    >
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="hover:text-foreground text-muted-foreground flex w-full items-center justify-between gap-2 py-2 text-left"
                        >
                          <span className="text-foreground truncate text-sm font-medium">
                            {group.category ?? "No category"}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className="font-mono text-[10px] tabular-nums">
                              {group.blocks.length}
                            </span>
                            <ChevronDownIcon
                              className={cn(
                                "transition-[rotate] duration-200 motion-reduce:transition-none",
                                !open && "-rotate-90",
                              )}
                            />
                          </span>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-border/60 mt-1 border-t pt-3 pb-2">
                          {cards}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 lg:order-1">
            <h3 className="mb-3 font-mono text-[11px] font-medium tracking-[0.16em] uppercase">
              The plan
            </h3>
            <div className="grid grid-cols-[3.25rem_minmax(0,1fr)]">
              <div aria-hidden className="relative" style={{ height: canvas }}>
                {ticks.map((tick, w) => (
                  <div
                    key={tick.week + "-" + w}
                    className="absolute inset-x-0 flex items-start justify-between pr-3 font-mono text-[10px] tabular-nums"
                    style={{ top: w * WEEK_H + 10 }}
                  >
                    <span className="text-foreground tracking-[0.1em]">
                      {tick.label ?? ""}
                    </span>
                    <span className="text-muted-foreground">w{tick.week}</span>
                  </div>
                ))}
                {nowTop !== null && (
                  <span
                    className="bg-brand text-brand-foreground absolute right-1 z-20 -translate-y-1/2 rounded-[2px] px-1 py-px font-mono text-[9px] tabular-nums"
                    style={{ top: nowTop }}
                  >
                    {dayLabel(today)}
                  </span>
                )}
              </div>

              <div
                ref={rail}
                className="border-border relative border-l"
                style={{ height: canvas }}
              >
                {ticks.map((tick, w) => (
                  <div
                    key={tick.week + "-" + w}
                    aria-hidden
                    className={cn(
                      "absolute inset-x-0 h-px",
                      tick.label ? "bg-border" : "bg-border/50",
                    )}
                    style={{ top: w * WEEK_H }}
                  />
                ))}

                {nowTop !== null && (
                  <div
                    aria-hidden
                    className="bg-brand/70 absolute inset-x-0 z-0 h-px"
                    style={{ top: nowTop }}
                  />
                )}

                {plan.length === 0 && !preview && (
                  <div
                    className="pointer-events-none absolute inset-x-0 px-1"
                    style={{ top: (nowTop ?? 0) + 12 }}
                  >
                    <EmptyState title="Nothing on the plan yet.">
                      Drag a block from your library onto this timeline, or
                      press Add to plan.
                    </EmptyState>
                  </div>
                )}

                {dropAt !== null && (
                  <div
                    aria-hidden
                    className="bg-brand absolute inset-x-0 z-30 h-0.5 rounded-full"
                    style={{
                      top: Math.max(
                        (layout[dropAt]?.top ??
                          (layout.at(-1)
                            ? (layout.at(-1)?.top ?? 0) +
                              (layout.at(-1)?.height ?? 0) +
                              GAP
                            : 0)) - 1,
                        0,
                      ),
                    }}
                  />
                )}

                <ol className="absolute inset-0 list-none">
                  {shown.map((placed, index) => (
                    <PlacedCard
                      key={placed.id}
                      placed={placed}
                      geometry={{
                        top: layout[index]?.top ?? 0,
                        height: layout[index]?.height ?? WEEK_H,
                      }}
                      flags={{
                        ghost: placed.id === GHOST,
                        target: placed.id === dropInto,
                        held:
                          holding?.kind === "move" && holding.id === placed.id,
                        canMoveUp: index > editFloor,
                        canMoveDown: index < shown.length - 1,
                        busy: board.busy,
                      }}
                      on={{
                        editTheme: (templateId) => {
                          const block = blocks.find((b) => b.id === templateId);
                          if (block) setForm(blockForm(block));
                        },
                        grab: (e) => startMove(e, placed.id, index),
                        resizeGrab: (e) =>
                          startResize(e, placed.id, index, placed.weeks),
                        resize: (weeks) => actions.resize(placed.id, weeks),
                        move: (delta) => actions.move(placed.id, index + delta),
                        remove: () => actions.unplace(placed.id),
                        removeTheme: actions.removeTheme,
                        editRun: (on) =>
                          setRunForm({
                            placementId: on.placementId,
                            theme: on.theme,
                            note: on.note ?? "",
                          }),
                      }}
                    />
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      <BlockDialog
        form={form}
        categories={categories}
        saving={board.savingBlock}
        onChange={setForm}
        onClose={() => setForm(null)}
        onSubmit={submitBlock}
      />

      <RunNoteDialog
        form={runForm}
        saving={board.savingRunNote}
        onChange={setRunForm}
        onClose={() => setRunForm(null)}
        onSubmit={(run) =>
          closeWhenSaved(
            actions.setRunNote(run.placementId, run.note.trim()),
            () => setRunForm(null),
          )
        }
      />

      <TrackDialog
        form={trackForm}
        saving={board.savingTrack}
        onChange={setTrackForm}
        onClose={() => setTrackForm(null)}
        onSubmit={(name) =>
          closeWhenSaved(
            trackForm?.id
              ? actions.renameTrack(trackForm.id, name)
              : actions.createTrack(name),
            () => setTrackForm(null),
          )
        }
      />
    </section>
  );
}

function StudentVisibility() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const academy = useAcademy();
  const on = academy.curriculumForStudents;

  const save = useMutation(
    trpc.academy.updateSettings.mutationOptions({
      onSuccess: async (_data, vars) => {
        await queryClient.invalidateQueries(trpc.academy.pathFilter());
        toast.success(
          vars.curriculumForStudents
            ? "Students can see the week's theme"
            : "The week's theme is staff-only again",
        );
      },
      onError: (err: { message: string }) =>
        toast.error(err.message || "Could not save that"),
    }),
  );

  if (academy.role !== "owner") return null;

  return (
    <label
      title="On their class screen, in the app and on the web. Instructors always see it. Your block notes stay staff-only either way."
      className="text-muted-foreground hover:text-foreground flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:min-h-0"
    >
      <input
        type="checkbox"
        className="accent-brand size-4"
        checked={on}
        disabled={save.isPending}
        onChange={(e) =>
          save.mutate({ curriculumForStudents: e.target.checked })
        }
      />
      Students see the week's theme
    </label>
  );
}

function LibraryCard({
  block,
  flags,
  on,
}: {
  block: Block;
  flags: { busy: boolean; held: boolean };
  on: {
    grab: (e: ReactPointerEvent) => void;
    add: () => void;
    edit: () => void;
    delete: () => Promise<unknown>;
  };
}) {
  return (
    <li
      className={cn(
        "border-border bg-card group/card flex items-start gap-2 rounded-lg border p-3",
        "transition-[background-color,border-color,opacity] duration-150 motion-reduce:transition-none",
        flags.held ? "border-brand opacity-60" : "hover:border-brand/40",
      )}
    >
      <button
        type="button"
        aria-label={`Drag ${block.theme} onto the plan`}
        onPointerDown={on.grab}
        className={cn(GRIP, "-mt-0.5 -ml-1.5")}
      >
        <GripIcon />
      </button>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium">{block.theme}</p>
        <p className="text-muted-foreground mt-0.5 font-mono text-[11px] tabular-nums">
          {weeksLabel(block.defaultWeeks)}
          {block.used > 0 &&
            ` · on the plan ${block.used === 1 ? "once" : `${block.used} times`}`}
          {block.tracks.length > 1 && ` · ${block.tracks.join(", ")}`}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={flags.busy}
          onClick={on.add}
        >
          Add to plan
        </Button>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity duration-150 group-focus-within/card:opacity-100 group-hover/card:opacity-100 motion-reduce:transition-none">
        <button
          type="button"
          aria-label={`Edit ${block.theme}`}
          onClick={on.edit}
          className={ICON_BTN}
        >
          <PencilIcon />
        </button>
        <ConfirmDialog
          trigger={
            <button
              type="button"
              aria-label={`Delete ${block.theme}`}
              className={ICON_BTN}
            >
              <XIcon />
            </button>
          }
          title={`Delete ${block.theme}?`}
          description="This removes the block from your library. A block that is on the plan has to come off it first."
          confirmLabel="Delete block"
          onConfirm={async () => {
            await on.delete();
          }}
        />
      </div>
    </li>
  );
}

function PlacedCard({
  placed,
  geometry,
  flags,
  on: act,
}: {
  placed: Placed;
  geometry: { top: number; height: number };
  flags: {
    ghost: boolean;
    target: boolean;
    held: boolean;
    canMoveUp: boolean;
    canMoveDown: boolean;
    busy: boolean;
  };
  on: {
    editTheme: (templateId: string) => void;
    grab: (e: ReactPointerEvent) => void;
    resizeGrab: (e: ReactPointerEvent) => void;
    resize: (weeks: number) => void;
    move: (delta: -1 | 1) => void;
    remove: () => void;
    removeTheme: (placementId: string) => void;
    editRun: (theme: Theme) => void;
  };
}) {
  const { ghost, target, held, canMoveUp, canMoveDown, busy } = flags;
  const settled = placed.state === "settled";
  const running = placed.state === "running";
  const editable = !settled && !ghost;
  const label = slotLabel(placed);
  const compact = placed.weeks === 1;

  const meta = (
    <p
      className={cn(
        "shrink-0 truncate font-mono text-[10px] tracking-[0.08em] uppercase tabular-nums",
        settled ? "text-muted-foreground/70" : "text-muted-foreground",
      )}
    >
      {dayLabel(placed.startsOn)} – {dayLabel(placed.endsOn)} ·{" "}
      {weeksLabel(placed.weeks)}
      {placed.themes.length > 1 && ` · ${placed.themes.length} blocks`}
    </p>
  );

  const themes = (
    <div
      className={cn(
        "relative z-10 grid min-h-0 min-w-0",
        compact ? "flex-1 self-stretch" : "h-full",
      )}
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(${compact ? "7rem" : "9rem"}, 1fr))`,
      }}
    >
      {placed.themes.map((on, at) => (
        <div
          key={on.placementId}
          className={cn(
            "group/theme flex min-w-0 flex-col gap-1 overflow-hidden pr-3",
            compact ? "justify-center" : "pt-0.5",
            at > 0 && "border-card-foreground/20 border-l pl-3",
          )}
        >
          <div className="flex min-w-0 items-start gap-1">
            <p
              className={cn(
                "min-w-0 flex-1 truncate font-medium",
                compact ? "text-sm" : "text-[15px]",
                settled ? "text-muted-foreground" : "text-card-foreground",
              )}
            >
              {on.theme}
            </p>
            {!ghost && (
              <div
                className={cn(
                  "-mt-0.5 flex shrink-0 items-center transition-opacity duration-150 group-focus-within/theme:opacity-100 group-hover/theme:opacity-100 motion-reduce:transition-none",
                  on.note ? "opacity-100" : "opacity-0",
                )}
              >
                <button
                  type="button"
                  aria-label={`Edit the block ${on.theme}`}
                  onClick={() => act.editTheme(on.templateId)}
                  className={cn(ICON_BTN, "size-6")}
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  aria-label={
                    on.note
                      ? `Edit the note for this run of ${on.theme}`
                      : `Add a note for this run of ${on.theme}`
                  }
                  onClick={() => act.editRun(on)}
                  className={cn(
                    ICON_BTN,
                    "size-6",
                    on.note && "text-brand hover:text-brand",
                  )}
                >
                  <NoteIcon />
                </button>
                {editable && placed.themes.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Take ${on.theme} off these weeks`}
                    disabled={busy}
                    onClick={() => act.removeTheme(on.placementId)}
                    className={cn(ICON_BTN, "size-6")}
                  >
                    <XIcon />
                  </button>
                )}
              </div>
            )}
          </div>
          {!compact && on.notes && (
            <p className="text-muted-foreground min-h-0 overflow-hidden text-xs leading-relaxed whitespace-pre-line">
              {on.notes}
            </p>
          )}
          {!compact && on.note && (
            <p className="min-h-0 overflow-hidden text-xs leading-relaxed whitespace-pre-line">
              <span className="text-brand-strong mr-1.5 font-mono text-[9px] tracking-[0.12em] uppercase">
                This run
              </span>
              <span className="text-card-foreground/80">{on.note}</span>
            </p>
          )}
        </div>
      ))}
      {target && (
        <div className="border-brand text-brand flex min-w-0 items-center justify-center border-l border-dashed pl-3 font-mono text-[10px] tracking-[0.08em] uppercase">
          Add here
        </div>
      )}
    </div>
  );

  return (
    <li
      className={cn(
        "absolute inset-x-0 flex flex-col overflow-hidden rounded-md border",
        "transition-[translate,height] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
        ENTER,
        "bg-card",
        settled && "border-card-foreground/14",
        !settled && "border-card-foreground/20",
        (ghost || held) && "border-brand shadow-md",
        target && "border-brand ring-brand/30 ring-2",
        ghost && "pointer-events-none opacity-70",
        held && "opacity-70",
      )}
      style={{ translate: `0 ${geometry.top}px`, height: geometry.height }}
    >
      {running && (
        <span
          aria-hidden
          className="bg-brand absolute inset-y-0 left-0 w-[3px] rounded-l-md"
        />
      )}

      <div
        className={cn(
          "flex min-w-0 items-center gap-3 px-3",
          compact ? "flex-1" : "pt-2 pb-1.5",
        )}
      >
        {editable && (
          <button
            type="button"
            aria-label={`Drag ${label} to another place on the plan`}
            onPointerDown={act.grab}
            disabled={busy}
            className={cn(GRIP, "-ml-1.5")}
          >
            <GripIcon />
          </button>
        )}

        {compact ? (
          <>
            {themes}
            {meta}
          </>
        ) : (
          meta
        )}

        {running && (
          <span className="text-brand shrink-0 font-mono text-[9px] tracking-[0.12em] uppercase">
            running
          </span>
        )}

        {!ghost && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {!settled && (
              <>
                <div className="border-border flex items-center overflow-hidden rounded-md border">
                  <button
                    type="button"
                    aria-label={`Shorten ${label} by a week`}
                    disabled={busy || placed.weeks <= 1}
                    onClick={() => act.resize(placed.weeks - 1)}
                    className={STEP}
                  >
                    <MinusIcon />
                  </button>
                  <span className="text-muted-foreground border-border border-x px-1.5 py-1 font-mono text-[11px] tabular-nums">
                    {placed.weeks}w
                  </span>
                  <button
                    type="button"
                    aria-label={`Extend ${label} by a week`}
                    disabled={busy || placed.weeks >= MAX_BLOCK_WEEKS}
                    onClick={() => act.resize(placed.weeks + 1)}
                    className={STEP}
                  >
                    <PlusIcon />
                  </button>
                </div>
                <button
                  type="button"
                  aria-label={`Move ${label} earlier`}
                  disabled={busy || !canMoveUp}
                  onClick={() => act.move(-1)}
                  className={CONTROL}
                >
                  <ArrowUpIcon />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${label} later`}
                  disabled={busy || !canMoveDown}
                  onClick={() => act.move(1)}
                  className={CONTROL}
                >
                  <ArrowDownIcon />
                </button>
                <button
                  type="button"
                  aria-label={`Take ${label} off the plan`}
                  disabled={busy}
                  onClick={act.remove}
                  className={cn(CONTROL, "text-muted-foreground")}
                >
                  <XIcon />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {!compact && (
        <>
          <div
            aria-hidden
            className="border-card-foreground/15 mx-3 border-t"
          />
          <div className="min-h-0 flex-1 overflow-hidden px-3 py-2">
            {themes}
          </div>
        </>
      )}

      {editable && (
        <button
          type="button"
          role="slider"
          aria-label={`${label} length in weeks`}
          aria-valuemin={1}
          aria-valuemax={MAX_BLOCK_WEEKS}
          aria-valuenow={placed.weeks}
          aria-valuetext={weeksLabel(placed.weeks)}
          onPointerDown={act.resizeGrab}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowRight") {
              e.preventDefault();
              if (placed.weeks < MAX_BLOCK_WEEKS) act.resize(placed.weeks + 1);
            }
            if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
              e.preventDefault();
              if (placed.weeks > 1) act.resize(placed.weeks - 1);
            }
          }}
          className="group absolute inset-x-0 bottom-0 flex h-3 cursor-ns-resize touch-none items-end justify-center pb-[3px]"
        >
          <span className="bg-border group-hover:bg-brand group-focus-visible:bg-brand h-[3px] w-9 rounded-full transition-[background-color,width] duration-150 group-hover:w-14 group-focus-visible:w-14 motion-reduce:transition-none" />
        </button>
      )}
    </li>
  );
}
