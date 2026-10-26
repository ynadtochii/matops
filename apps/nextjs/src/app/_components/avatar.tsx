import Image from "next/image";

import { cn } from "@matops/ui";

function AvatarImage({ src }: { src: string }) {
  return (
    <Image
      src={src}
      alt=""
      width={128}
      height={128}
      unoptimized
      className="size-full object-cover"
    />
  );
}

function initials(name: string, email = ""): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  const second = words[1];
  if (first && second) {
    return (first.charAt(0) + second.charAt(0)).toUpperCase();
  }
  if (first) return first.slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase() || "?";
}

export function Avatar({
  src,
  name,
  email,
  edge = false,
  className = "size-7",
}: {
  src?: string | null;
  name: string;
  email?: string;
  edge?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        edge ? "edge-lit-surface-2" : "bg-active",
        "text-foreground-secondary relative flex shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold uppercase",
        className,
      )}
    >
      {src ? <AvatarImage src={src} /> : initials(name, email)}
    </span>
  );
}

export function AcademyIcon({
  src,
  name,
  className = "size-7",
}: {
  src?: string | null;
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "bg-active text-foreground-secondary relative flex shrink-0 items-center justify-center overflow-hidden rounded-md text-xs font-semibold uppercase",
        className,
      )}
    >
      {src ? <AvatarImage src={src} /> : name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
