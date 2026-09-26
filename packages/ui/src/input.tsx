import { cn } from "@matops/ui";

export const FIELD =
  "border-input bg-raised text-foreground placeholder:text-foreground-faint w-full min-w-0 rounded-md border px-2.5 text-sm outline-none " +
  "transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none " +
  "hover:border-field-hover focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-brand-wash " +
  "aria-invalid:border-error disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

export function Input({
  className,
  type,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        FIELD,
        "file:text-foreground h-11 py-1 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium sm:h-8",
        className,
      )}
      {...props}
    />
  );
}
