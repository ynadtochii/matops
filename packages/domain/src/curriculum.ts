import { DAY_MS } from "./local-date";

export interface Placement {
  id: string;
  startsOn: string;
  endsOn: string;
  weeks: number;
}

type PlacementState = "settled" | "running" | "draft";

export const BLOCK_WEEK_CHOICES = [1, 2, 3, 4, 6, 8] as const;

export const MAX_BLOCK_WEEKS = 52;

function parseDay(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / DAY_MS);
}

function formatDay(dayNumber: number): string {
  const d = new Date(dayNumber * DAY_MS);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(iso: string, days: number): string {
  return formatDay(parseDay(iso) + days);
}

export function isoWeek(iso: string): number {
  const day = parseDay(iso);
  const weekday = (new Date(day * DAY_MS).getUTCDay() + 6) % 7;
  const thursday = day - weekday + 3;
  const year = new Date(thursday * DAY_MS).getUTCFullYear();
  const jan4 = Math.floor(Date.UTC(year, 0, 4) / DAY_MS);
  const jan4Weekday = (new Date(jan4 * DAY_MS).getUTCDay() + 6) % 7;
  return Math.floor((thursday - 3 - (jan4 - jan4Weekday)) / 7) + 1;
}

export function mondayOf(iso: string): string {
  const day = parseDay(iso);
  return formatDay(day - ((new Date(day * DAY_MS).getUTCDay() + 6) % 7));
}

export function daysBetween(from: string, to: string): number {
  return parseDay(to) - parseDay(from);
}

export function endOfBlock(startsOn: string, weeks: number): string {
  return addDays(startsOn, weeks * 7 - 1);
}

interface LibraryBlock {
  category: string | null;
  theme: string;
}

export const MAX_CATEGORY_LENGTH = 40;

export const MAX_TRACK_NAME_LENGTH = 40;

export const MAX_SLOT_BLOCKS = 10;

export function canonicalCategory(
  input: string | null | undefined,
  existing: string[],
): string | null {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;
  const match = existing.find(
    (name) => name.toLowerCase() === trimmed.toLowerCase(),
  );
  return match ?? trimmed;
}

export function categoryNames(blocks: LibraryBlock[]): string[] {
  const seen = new Map<string, string>();
  for (const block of blocks) {
    if (block.category && !seen.has(block.category.toLowerCase())) {
      seen.set(block.category.toLowerCase(), block.category);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function groupByCategory<T extends LibraryBlock>(
  blocks: T[],
): { category: string | null; blocks: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const block of blocks) {
    const key = block.category ?? "";
    const bucket = groups.get(key);
    if (bucket) bucket.push(block);
    else groups.set(key, [block]);
  }
  return [...groups.entries()]
    .map(([category, list]) => ({
      category: category === "" ? null : category,
      blocks: [...list].sort((a, b) => a.theme.localeCompare(b.theme)),
    }))
    .sort((a, b) => {
      if (a.category === null) return 1;
      if (b.category === null) return -1;
      return a.category.localeCompare(b.category);
    });
}

export function placementState(
  placement: Placement,
  today: string,
): PlacementState {
  if (placement.endsOn < today) return "settled";
  if (placement.startsOn > today) return "draft";
  return "running";
}

export function firstEditableIndex(
  placements: Placement[],
  today: string,
): number {
  return placements.findIndex((p) => p.endsOn >= today);
}

export function editableFloor(placements: Placement[], today: string): number {
  const at = firstEditableIndex(placements, today);
  return at === -1 ? placements.length : at;
}

export function nextStart(placements: Placement[], today: string): string {
  const monday = mondayOf(today);
  const last = placements.at(-1);
  if (!last) return monday;
  const after = addDays(last.endsOn, 1);
  return after > monday ? after : monday;
}

export function rippleFrom<T extends Placement>(
  placements: T[],
  index: number,
  weeks: number,
): T[] {
  const anchor = placements[index];
  if (!anchor) {
    throw new RangeError(`rippleFrom: index ${index} out of range`);
  }
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_BLOCK_WEEKS) {
    throw new RangeError(`rippleFrom: weeks must be 1…${MAX_BLOCK_WEEKS}`);
  }
  const out = placements.slice(0, index);
  let cursor = anchor.startsOn;
  for (const [offset, placement] of placements.slice(index).entries()) {
    const span = offset === 0 ? weeks : placement.weeks;
    const endsOn = endOfBlock(cursor, span);
    out.push({ ...placement, startsOn: cursor, endsOn, weeks: span });
    cursor = addDays(endsOn, 1);
  }
  return out;
}

export function insertPlacement<T extends Placement>(
  placements: T[],
  index: number,
  placement: T,
  today: string,
): T[] {
  const at = Math.max(0, Math.min(index, placements.length));
  const startsOn = placements[at]?.startsOn ?? nextStart(placements, today);
  const next = [
    ...placements.slice(0, at),
    { ...placement, startsOn },
    ...placements.slice(at),
  ];
  return rippleFrom(next, at, placement.weeks);
}

export function removePlacement<T extends Placement>(
  placements: T[],
  index: number,
): T[] {
  const removed = placements[index];
  if (!removed) return placements;
  const rest = [...placements.slice(0, index), ...placements.slice(index + 1)];
  const tail = rest[index];
  if (!tail) return rest;
  rest[index] = { ...tail, startsOn: removed.startsOn };
  return rippleFrom(rest, index, tail.weeks);
}

export function movePlacement<T extends Placement>(
  placements: T[],
  from: number,
  to: number,
): T[] {
  const source = placements[from];
  if (!source) {
    throw new RangeError(`movePlacement: index ${from} out of range`);
  }
  const target = Math.max(0, Math.min(to, placements.length - 1));
  if (target === from) return placements;
  const reordered = [...placements];
  reordered.splice(from, 1);
  reordered.splice(target, 0, source);
  const at = Math.min(from, target);
  const anchor = placements[at];
  const head = reordered[at];
  if (!anchor || !head) return placements;
  reordered[at] = { ...head, startsOn: anchor.startsOn };
  return rippleFrom(reordered, at, head.weeks);
}

export function placementForDate<T extends Placement>(
  placements: T[],
  date: string,
): T | null {
  for (const placement of placements) {
    if (placement.startsOn <= date && placement.endsOn >= date) {
      return placement;
    }
  }
  return null;
}
