"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef, useState } from "react";

import {
  addDays,
  daysBetween,
  insertPlacement,
  MAX_BLOCK_WEEKS,
  MAX_SLOT_BLOCKS,
  movePlacement,
  rippleFrom,
} from "@matops/domain";

import type { Block, Placed } from "./curriculum-shared";
import { DAY_H, GAP, GHOST, WEEK_H } from "./curriculum-shared";

type Held =
  | { kind: "new"; blockId: string; theme: string; weeks: number }
  | { kind: "move"; slotId: string; from: number }
  | {
      kind: "resize";
      slotId: string;
      index: number;
      startY: number;
      weeks: number;
    };

/** Each edge of a stretch keeps this many pixels free, so the line between two
 *  stretches stays reachable when a block could also join the one above. */
const EDGE_BAND = 12;

interface TimelineDragOptions {
  plan: Placed[];
  today: string;
  anchor: string;
  editFloor: number;
  enabled: boolean;
  onPlace: (blockId: string, atIndex: number, slotId?: string) => void;
  onMove: (slotId: string, toIndex: number) => void;
  onResize: (slotId: string, weeks: number) => void;
}

/**
 * The pointer machine behind the timeline. It owns the drag itself and the
 * preview plan a drag implies, and it commits through the three callbacks. Every
 * preview runs through the same domain function the buttons use, so dragging and
 * pressing a button can never disagree about where a block lands.
 */
export function useTimelineDrag(opts: TimelineDragOptions) {
  const { plan, today, anchor, editFloor, enabled } = opts;
  const rail = useRef<HTMLDivElement>(null);
  const held = useRef<Held | null>(null);
  const [preview, setPreview] = useState<Placed[] | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [dropInto, setDropInto] = useState<string | null>(null);
  const [holding, setHolding] = useState<{
    kind: "new" | "move";
    id: string;
  } | null>(null);

  const topOf = (placed: Placed) =>
    daysBetween(anchor, placed.startsOn) * DAY_H;

  const indexAt = (clientY: number, ignore?: string): number => {
    const box = rail.current?.getBoundingClientRect();
    if (!box) return plan.length;
    const y = clientY - box.top;
    let index = plan.length;
    for (const [i, placed] of plan.entries()) {
      if (placed.id === ignore) continue;
      if (y < topOf(placed) + (placed.weeks * WEEK_H) / 2) {
        index = i;
        break;
      }
    }
    return Math.max(index, editFloor);
  };

  const slotAt = (clientY: number, blockId: string): Placed | null => {
    const box = rail.current?.getBoundingClientRect();
    if (!box) return null;
    const y = clientY - box.top;
    for (const [index, placed] of plan.entries()) {
      if (index < editFloor) continue;
      const top = topOf(placed);
      const bottom = top + placed.weeks * WEEK_H - GAP;
      if (y <= top + EDGE_BAND || y >= bottom - EDGE_BAND) continue;
      if (placed.themes.length >= MAX_SLOT_BLOCKS) return null;
      if (placed.themes.some((on) => on.templateId === blockId)) return null;
      return placed;
    }
    return null;
  };

  const clear = () => {
    held.current = null;
    setHolding(null);
    setPreview(null);
    setDropAt(null);
    setDropInto(null);
  };

  const capture = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const startPlace = (e: ReactPointerEvent, block: Block) => {
    if (!enabled) return;
    capture(e);
    held.current = {
      kind: "new",
      blockId: block.id,
      theme: block.theme,
      weeks: block.defaultWeeks,
    };
    setHolding({ kind: "new", id: block.id });
  };

  const startMove = (e: ReactPointerEvent, slotId: string, from: number) => {
    if (!enabled) return;
    capture(e);
    held.current = { kind: "move", slotId, from };
    setHolding({ kind: "move", id: slotId });
  };

  const startResize = (
    e: ReactPointerEvent,
    slotId: string,
    index: number,
    weeks: number,
  ) => {
    if (!enabled) return;
    capture(e);
    held.current = { kind: "resize", slotId, index, startY: e.clientY, weeks };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = held.current;
    if (!drag) return;

    if (drag.kind === "resize") {
      const next = Math.min(
        MAX_BLOCK_WEEKS,
        Math.max(
          1,
          Math.round(drag.weeks + (e.clientY - drag.startY) / WEEK_H),
        ),
      );
      setPreview(rippleFrom(plan, drag.index, next));
      return;
    }

    if (drag.kind === "move") {
      const at = indexAt(e.clientY, drag.slotId);
      const to = drag.from < at ? at - 1 : at;
      setDropAt(at);
      setPreview(to === drag.from ? plan : movePlacement(plan, drag.from, to));
      return;
    }

    const into = slotAt(e.clientY, drag.blockId);
    if (into) {
      setDropInto(into.id);
      setDropAt(null);
      setPreview(null);
      return;
    }
    setDropInto(null);
    const at = indexAt(e.clientY);
    setDropAt(at);
    setPreview(
      insertPlacement(
        plan,
        at,
        {
          id: GHOST,
          startsOn: today,
          endsOn: addDays(today, drag.weeks * 7 - 1),
          weeks: drag.weeks,
          themes: [
            {
              placementId: GHOST,
              templateId: drag.blockId,
              theme: drag.theme,
              notes: null,
              note: null,
            },
          ],
          state: "draft",
        },
        today,
      ),
    );
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const drag = held.current;
    const at = dropAt;
    const into = dropInto;
    const previewNow = preview;
    clear();
    if (!drag) return;

    if (drag.kind === "resize") {
      const weeks = previewNow?.[drag.index]?.weeks;
      if (weeks && weeks !== drag.weeks) opts.onResize(drag.slotId, weeks);
      return;
    }

    const box = rail.current?.getBoundingClientRect();
    if (!box || e.clientY < box.top - 40 || e.clientY > box.bottom + 40) return;

    if (drag.kind === "new") {
      const index = into ? plan.findIndex((p) => p.id === into) : -1;
      opts.onPlace(
        drag.blockId,
        into ? Math.max(index, 0) : (at ?? plan.length),
        into ?? undefined,
      );
      return;
    }

    if (at === null) return;
    const to = drag.from < at ? at - 1 : at;
    if (to !== drag.from) opts.onMove(drag.slotId, to);
  };

  return {
    rail,
    preview,
    dropAt,
    dropInto,
    holding,
    startPlace,
    startMove,
    startResize,
    surface: { onPointerMove, onPointerUp, onPointerCancel: clear },
  };
}
