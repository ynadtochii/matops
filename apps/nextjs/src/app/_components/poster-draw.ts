import type { DisciplineTone } from "@matops/domain";
import { busyHours, disciplineTone, hourSlots } from "@matops/domain";

import { POSTER_H, POSTER_W } from "./poster-size";

export interface PosterClass {
  title: string;
  discipline: string | null;
  daysOfWeek: number[];
  startsAtMinutes: number;
  durationMinutes: number;
  instructorName: string | null;
}

export interface PosterData {
  academyName: string;
  joinCode: string;
  updatedLabel: string;
  classes: PosterClass[];
}

export { POSTER_H, POSTER_W };
export const POSTER_SCALE = 2;

const PAD = 64;
const GRID_TOP = 208;
const GRID_BOTTOM = 1096;
const GUTTER = 72;
const GAP_H = 30;
const MIN_BLOCK_H = 46;

const PAPER = "#ffffff";
const INK = "#0c0a09";
const QUIET = "#79716b";
const LINE = "#e7e5e4";
const GI = "#0f766e";
const NOGI = "#b45309";
const VIOLET = "#6a4dff";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Print ink per tone. Open mat gets none: on paper it reads as a plain block. */
const TONE_HUE: Record<DisciplineTone, string | null> = {
  gi: GI,
  nogi: NOGI,
  other: null,
};

function overPaper(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c * alpha + 255 * (1 - alpha));
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

interface Slot {
  kind: "hour" | "gap";
  from: number;
  to: number;
  y: number;
  h: number;
}

export interface PosterLayout {
  days: number[];
  slots: Slot[];
  hourH: number;
  offsetOf: (hour: number) => number;
}

export function layoutPoster(classes: PosterClass[]): PosterLayout {
  const used = new Set<number>();
  for (const c of classes) for (const d of c.daysOfWeek) used.add(d);
  const busy = busyHours(
    classes.map((c) => ({
      startMinutes: c.startsAtMinutes,
      durationMinutes: c.durationMinutes,
    })),
  );
  const days = [1, 2, 3, 4, 5, 6].filter((d) => used.has(d));
  if (used.has(0)) days.push(0);
  if (days.length === 0) days.push(1, 2, 3, 4, 5, 6);

  const hours = [...busy].sort((a, b) => a - b);
  const first = hours[0] ?? 8;
  const last = (hours[hours.length - 1] ?? 20) + 1;

  const shape: Slot[] = hourSlots(busy, first, last).map((s) => ({
    ...s,
    y: 0,
    h: s.kind === "gap" ? GAP_H : 0,
  }));

  const hourRows = shape.filter((s) => s.kind === "hour").length || 1;
  const gapRows = shape.filter((s) => s.kind === "gap").length;
  const hourH = Math.min(
    120,
    Math.max(52, (GRID_BOTTOM - GRID_TOP - gapRows * GAP_H) / hourRows),
  );

  const offsets = new Map<number, number>();
  let y = GRID_TOP;
  const slots: Slot[] = shape.map((s) => {
    const h = s.kind === "gap" ? GAP_H : hourH;
    const placed = { ...s, y, h };
    for (let hour = s.from; hour < s.to; hour++) offsets.set(hour, y);
    y += h;
    return placed;
  });

  return {
    days,
    slots,
    hourH,
    offsetOf: (hour) => offsets.get(hour) ?? GRID_TOP,
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function clip(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

function fontStacks() {
  const s = getComputedStyle(document.body);
  const sans = s.getPropertyValue("--font-geist-sans").trim();
  const mono = s.getPropertyValue("--font-geist-mono").trim();
  return {
    sans: `${sans ? `${sans}, ` : ""}system-ui, sans-serif`,
    mono: `${mono ? `${mono}, ` : ""}ui-monospace, monospace`,
  };
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  mono: string,
  right: number,
  y: number,
) {
  const items: { label: string; hue: string | null }[] = [
    { label: "GI", hue: GI },
    { label: "NOGI", hue: NOGI },
    { label: "OPEN MAT", hue: null },
  ];
  ctx.font = `500 15px ${mono}`;
  ctx.textAlign = "left";
  const widths = items.map((i) => 26 + ctx.measureText(i.label).width);
  const total = widths.reduce((a, b) => a + b, 0) + 32 * (items.length - 1);
  let x = right - total;
  items.forEach((item, i) => {
    ctx.fillStyle = item.hue ? overPaper(item.hue, 0.1) : PAPER;
    ctx.strokeStyle = item.hue ?? LINE;
    ctx.lineWidth = 1;
    if (item.hue) {
      roundRect(ctx, x, y - 12, 18, 14, 3);
      ctx.fill();
      ctx.fillStyle = item.hue;
      ctx.fillRect(x, y - 12, 3, 14);
    } else {
      ctx.setLineDash([3, 3]);
      roundRect(ctx, x, y - 12, 18, 14, 3);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = QUIET;
    ctx.fillText(item.label, x + 26, y);
    x += (widths[i] ?? 0) + 32;
  });
}

export function drawPoster(
  canvas: HTMLCanvasElement,
  data: PosterData,
  layout = layoutPoster(data.classes),
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { sans, mono } = fontStacks();

  canvas.width = POSTER_W * POSTER_SCALE;
  canvas.height = POSTER_H * POSTER_SCALE;
  ctx.resetTransform();
  ctx.scale(POSTER_SCALE, POSTER_SCALE);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  ctx.textAlign = "left";
  ctx.fillStyle = QUIET;
  ctx.font = `500 15px ${mono}`;
  ctx.letterSpacing = "2px";
  ctx.fillText("WEEKLY SCHEDULE", PAD, PAD + 16);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = INK;
  ctx.font = `600 48px ${sans}`;
  ctx.fillText(clip(ctx, data.academyName, 900), PAD, PAD + 72);

  drawLegend(ctx, mono, POSTER_W - PAD, PAD + 66);

  const gridLeft = PAD + GUTTER;
  const gridRight = POSTER_W - PAD;
  const colW = (gridRight - gridLeft) / layout.days.length;

  ctx.font = `500 17px ${mono}`;
  ctx.letterSpacing = "1.5px";
  layout.days.forEach((day, i) => {
    ctx.fillStyle = INK;
    ctx.fillText(
      (DAY_NAMES[day] ?? "").slice(0, 3).toUpperCase(),
      gridLeft + i * colW + 12,
      GRID_TOP - 22,
    );
  });
  ctx.letterSpacing = "0px";

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  const gridBottom = layout.slots.length
    ? (layout.slots.at(-1)?.y ?? GRID_TOP) + (layout.slots.at(-1)?.h ?? 0)
    : GRID_TOP;

  ctx.beginPath();
  ctx.moveTo(PAD, GRID_TOP - 0.5);
  ctx.lineTo(gridRight, GRID_TOP - 0.5);
  ctx.stroke();

  for (const slot of layout.slots) {
    ctx.beginPath();
    ctx.moveTo(PAD, slot.y + slot.h - 0.5);
    ctx.lineTo(gridRight, slot.y + slot.h - 0.5);
    ctx.stroke();

    if (slot.kind === "hour") {
      ctx.fillStyle = QUIET;
      ctx.font = `500 15px ${mono}`;
      ctx.textAlign = "right";
      ctx.fillText(hhmm(slot.from * 60), gridLeft - 16, slot.y + 20);
      ctx.textAlign = "left";
    } else {
      ctx.fillStyle = "#fafaf9";
      ctx.fillRect(PAD, slot.y, gridRight - PAD, slot.h);
      ctx.fillStyle = QUIET;
      ctx.font = `500 13px ${mono}`;
      ctx.textAlign = "center";
      ctx.letterSpacing = "1.5px";
      ctx.fillText(
        `NO CLASSES ${hhmm(slot.from * 60)} - ${hhmm(slot.to * 60)}`,
        (PAD + gridRight) / 2,
        slot.y + slot.h / 2 + 5,
      );
      ctx.letterSpacing = "0px";
      ctx.textAlign = "left";
    }
  }

  layout.days.forEach((_, i) => {
    if (i === 0) return;
    const x = gridLeft + i * colW - 0.5;
    ctx.beginPath();
    ctx.moveTo(x, GRID_TOP);
    ctx.lineTo(x, gridBottom);
    ctx.stroke();
  });

  for (const cls of data.classes) {
    const hue = TONE_HUE[disciplineTone(cls.discipline)];
    for (const day of cls.daysOfWeek) {
      const col = layout.days.indexOf(day);
      if (col < 0) continue;
      const x = gridLeft + col * colW + 6;
      const w = colW - 12;
      const y =
        layout.offsetOf(Math.floor(cls.startsAtMinutes / 60)) +
        ((cls.startsAtMinutes % 60) / 60) * layout.hourH;
      const h = Math.max(
        (cls.durationMinutes / 60) * layout.hourH - 6,
        MIN_BLOCK_H,
      );

      ctx.fillStyle = hue ? overPaper(hue, 0.08) : PAPER;
      roundRect(ctx, x, y, w, h, 4);
      ctx.fill();
      ctx.strokeStyle = hue ? overPaper(hue, 0.35) : LINE;
      ctx.lineWidth = 1;
      if (!hue) ctx.setLineDash([4, 4]);
      roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 4);
      ctx.stroke();
      ctx.setLineDash([]);
      if (hue) {
        ctx.fillStyle = hue;
        roundRect(ctx, x, y, 4, h, 2);
        ctx.fill();
      }

      ctx.fillStyle = QUIET;
      ctx.font = `500 14px ${mono}`;
      ctx.fillText(
        `${hhmm(cls.startsAtMinutes)} - ${hhmm(cls.startsAtMinutes + cls.durationMinutes)}`,
        x + 14,
        y + 21,
      );

      ctx.fillStyle = INK;
      ctx.font = `600 18px ${sans}`;
      ctx.fillText(clip(ctx, cls.title, w - 26), x + 14, y + 43);

      if (cls.instructorName && h > 58) {
        ctx.fillStyle = QUIET;
        ctx.font = `400 15px ${sans}`;
        ctx.fillText(clip(ctx, cls.instructorName, w - 26), x + 14, y + 63);
      }
    }
  }

  const footY = POSTER_H - PAD - 6;
  ctx.fillStyle = VIOLET;
  roundRect(ctx, PAD, footY - 30, 8, 8, 2);
  ctx.fill();

  ctx.fillStyle = INK;
  ctx.font = `500 18px ${sans}`;
  ctx.fillText(`Join with gym code ${data.joinCode}`, PAD + 22, footY - 21);

  ctx.fillStyle = QUIET;
  ctx.font = `400 15px ${sans}`;
  ctx.fillText("Book your spot in the matops app", PAD + 22, footY + 3);

  ctx.textAlign = "right";
  ctx.font = `500 15px ${mono}`;
  ctx.fillText(data.updatedLabel, POSTER_W - PAD, footY - 21);
  ctx.textAlign = "left";
}

export async function posterBlob(
  canvas: HTMLCanvasElement,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
