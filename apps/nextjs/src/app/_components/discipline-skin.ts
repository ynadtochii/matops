import { cn } from "@matops/ui";

const HUE_SKIN = [
  "border-l-discipline-1 bg-[color-mix(in_oklab,var(--color-discipline-1)_8%,var(--color-card))] glow-edge-discipline-1",
  "border-l-discipline-2 bg-[color-mix(in_oklab,var(--color-discipline-2)_8%,var(--color-card))] glow-edge-discipline-2",
  "border-l-discipline-3 bg-[color-mix(in_oklab,var(--color-discipline-3)_8%,var(--color-card))] glow-edge-discipline-3",
  "border-l-discipline-4 bg-[color-mix(in_oklab,var(--color-discipline-4)_8%,var(--color-card))] glow-edge-discipline-4",
  "border-l-discipline-5 bg-[color-mix(in_oklab,var(--color-discipline-5)_8%,var(--color-card))] glow-edge-discipline-5",
];
const DEFAULT_SKIN =
  "border-l-discipline-default bg-[color-mix(in_oklab,var(--color-discipline-default)_8%,var(--color-card))] glow-edge-discipline-default";

export const hueSkin = (hue: number | null) =>
  cn(
    "border-border border border-l-[3px]",
    hue === null ? DEFAULT_SKIN : HUE_SKIN[hue],
  );

export function blockSkin(hue: number | null, cancelled: boolean) {
  if (cancelled)
    return "border border-dashed border-error/40 bg-[color-mix(in_oklab,var(--color-error)_5%,var(--color-card))] text-muted-foreground";
  return hueSkin(hue);
}
