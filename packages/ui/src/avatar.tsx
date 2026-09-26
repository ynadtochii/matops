"use client";

import { Avatar as AvatarPrimitive } from "radix-ui";

import { cn } from "@matops/ui";

const SIZE = {
  sm: "size-5 text-2xs",
  md: "size-7 text-xs",
  lg: "size-10 text-sm",
} as const;

export function Avatar({
  src,
  name,
  size = "sm",
  className,
}: {
  src?: string | null;
  name: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "bg-active text-foreground-secondary inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none",
        SIZE[size],
        className,
      )}
    >
      {src && (
        <AvatarPrimitive.Image
          src={src}
          alt=""
          className="size-full object-cover"
        />
      )}
      <AvatarPrimitive.Fallback aria-hidden="true">
        {initials}
      </AvatarPrimitive.Fallback>
      <span className="sr-only">{name}</span>
    </AvatarPrimitive.Root>
  );
}
