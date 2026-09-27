import { cn } from "@matops/ui";

/**
 * Loading spinner: an arc that sweeps around a faint track of the same colour.
 * Both strokes use `currentColor`, so the spinner takes the text colour of
 * wherever it sits: muted grey by default, or the button's own label colour
 * when it sits inside a filled button (pass `className="text-current"`). Pure SVG + the Tailwind
 * `animate-spin` keyframe; no JS timer.
 *
 * Reduced motion: the ring stops turning and shows a static three-quarter arc,
 * so the control still reads as "busy" without movement.
 *
 * Sizes map to the button heights: `sm` pairs with a `sm` button, `md` is the
 * default inline size, `lg` is for full-panel loading. Pass `label` when the
 * spinner is the only thing on screen; inline-with-text spinners stay silent
 * (`aria-hidden`) so a screen reader hears the label once, not twice.
 */
const SIZES = { sm: 14, md: 18, lg: 28 } as const;

export function Spinner({
  size = "md",
  label,
  className,
}: {
  size?: keyof typeof SIZES;
  label?: string;
  className?: string;
}) {
  const px = SIZES[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "text-muted-foreground animate-spin motion-reduce:animate-none",
        className,
      )}
    >
      {/* faint full ring — the track the arc travels on */}
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeWidth="2.5"
      />
      {/* the moving arc: three-quarters of the circle, top → left */}
      <path
        d="M12 3A9 9 0 1 1 3 12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
