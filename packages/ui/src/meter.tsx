import { cn } from "@matops/ui";

const TONE = {
  neutral: "bg-meter",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
} as const;

export type MeterTone = keyof typeof TONE;

export interface MeterSegment {
  value: number;
  tone?: MeterTone;
}

export function Meter({
  value = 0,
  tone = "neutral",
  segments,
  max,
  label,
  glow = false,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  value?: number;
  tone?: MeterTone;
  segments?: MeterSegment[];
  max: number;
  label: string;
  glow?: boolean;
}) {
  const parts = segments ?? [{ value, tone }];
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  const bars = parts.reduce<{ tone: MeterTone; from: number; share: number }[]>(
    (acc, part) => {
      const from = acc.reduce((sum, b) => sum + b.share, 0);
      const share =
        max > 0 ? Math.max(0, Math.min(part.value / max, 1 - from)) : 0;
      return [...acc, { tone: part.tone ?? "neutral", from, share }];
    },
    [],
  );
  const tip = [...bars].reverse().find((b) => b.share > 0);
  const move =
    "transition-transform duration-300 motion-reduce:transition-none";
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(total, max)}
      aria-label={label}
      data-slot="meter"
      className={cn("relative h-1 w-full", className)}
      {...props}
    >
      <div className="bg-track absolute inset-0 overflow-hidden rounded-full">
        {/* Scaled full-width spans animate a transform; a width change would relayout the row. */}
        {bars.map((bar, i) => (
          <span
            key={i}
            className={cn(
              "absolute inset-y-0 left-0 w-full origin-left",
              move,
              TONE[bar.tone],
            )}
            style={{
              transform: `translateX(${bar.from * 100}%) scaleX(${bar.share})`,
            }}
          />
        ))}
      </div>
      {glow && tip && (
        <span
          aria-hidden
          className={cn("pointer-events-none absolute inset-0", move)}
          style={{ transform: `translateX(${(tip.from + tip.share) * 100}%)` }}
        >
          <span className="absolute top-1/2 left-0 hidden h-0 w-3 -translate-x-1/2 shadow-[0_0_10px_3px_color-mix(in_oklab,var(--color-foreground)_28%,transparent)] dark:block" />
        </span>
      )}
    </div>
  );
}
