/**
 * The hour-slot rule behind every week grid we draw: the on-screen O2 calendar
 * and the printed schedule poster. Both collapse a long quiet stretch into one
 * "no classes" band instead of drawing empty hours, and they must agree, or the
 * poster on the wall stops matching the app.
 */

export interface HourSpan {
  /** Minutes past local midnight the class starts. */
  startMinutes: number;
  durationMinutes: number;
}

export type HourSlot =
  | { kind: "hour"; from: number; to: number }
  | { kind: "gap"; from: number; to: number };

/** The local hours any class touches. A class always occupies its start hour. */
export function busyHours(spans: HourSpan[]): Set<number> {
  const busy = new Set<number>();
  for (const s of spans) {
    const from = Math.floor(s.startMinutes / 60);
    const to = Math.ceil((s.startMinutes + s.durationMinutes) / 60);
    for (let h = from; h < Math.max(to, from + 1); h++) busy.add(h);
  }
  return busy;
}

/** How many free hours in a row are worth collapsing into one band. */
export const MIN_GAP_HOURS = 2;

/**
 * Walk `[first, last)` and emit one slot per drawn row: an hour row, or a gap
 * row standing in for a run of at least `MIN_GAP_HOURS` free hours. Callers own
 * the pixel heights and the padding around the busy range.
 */
export function hourSlots(
  busy: Set<number>,
  first: number,
  last: number,
): HourSlot[] {
  const slots: HourSlot[] = [];
  for (let h = first; h < last; h++) {
    if (!busy.has(h)) {
      let end = h;
      while (end < last && !busy.has(end)) end++;
      if (end - h >= MIN_GAP_HOURS) {
        slots.push({ kind: "gap", from: h, to: end });
        h = end - 1;
        continue;
      }
    }
    slots.push({ kind: "hour", from: h, to: h + 1 });
  }
  return slots;
}
