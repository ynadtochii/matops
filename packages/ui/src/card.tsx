import { cn } from "@matops/ui";

export type CardLevel = "flat" | "raised" | "selected";

export function cardClass({
  level = "flat",
  interactive = false,
}: { level?: CardLevel; interactive?: boolean } = {}) {
  return cn(
    "rounded-lg border p-4",
    // Flat keeps a border (transparent in dark) so selecting a card never shifts the layout.
    level === "flat" && "bg-card border-card-edge",
    level === "selected" && "bg-card border-foreground-secondary",
    level === "raised" && "edge-rim-raised shadow-float",
    interactive &&
      level !== "raised" &&
      "hover:bg-hover transition-colors motion-reduce:transition-none",
  );
}
