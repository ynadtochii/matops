import { cn } from "@matops/ui";

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "border-border bg-secondary text-muted-foreground text-2xs inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-sm border px-1 font-sans font-medium",
        className,
      )}
      {...props}
    />
  );
}
