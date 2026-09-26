import { cn } from "@matops/ui";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "bg-muted animate-pulse rounded-sm motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}
