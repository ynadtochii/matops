import { cn } from "@matops/ui";

import { FOCUS_RING } from "./motion";

/**
 * Web Select — a native `<select>` restyled to match `Input` (same height,
 * border, focus ring, radius) with a custom chevron so it stops reading as a
 * raw browser control. Single element, so it's drop-in anywhere a bare
 * `<select>` was: width and margin come from `className` like before. Mobile
 * uses its own picker; there is no `.native` twin.
 *
 * The chevron is a background data-URI in stone-500 — a mid grey that reads on
 * both the white (light) and near-black (dark) surfaces, so no theme switch is
 * needed. `appearance-none` removes the OS arrow; `pr-8` clears space for ours.
 * The image is set inline (not a Tailwind arbitrary value) to avoid data-URI
 * escaping pitfalls; positioning/size stay as utilities.
 */
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%2379716b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6.5l4 4 4-4'/%3E%3C/svg%3E\")";

export function Select({
  className,
  style,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      style={{ backgroundImage: CHEVRON, ...style }}
      className={cn(
        "border-input text-foreground h-11 max-w-full appearance-none rounded-md border bg-transparent bg-no-repeat py-1 pr-8 pl-3 text-base shadow-xs transition-[color,box-shadow] outline-none sm:h-9 md:text-sm",
        "bg-[length:1rem] bg-[position:right_0.55rem_center]",
        `focus-visible:border-ring ${FOCUS_RING}`,
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
