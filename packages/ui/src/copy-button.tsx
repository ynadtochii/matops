"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@radix-ui/react-icons";

import { cn } from "@matops/ui";

import { Button } from "./button";
import { toast } from "./toast";

const STACK = "col-start-1 row-start-1";
const EASE =
  "duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none";
const SWAP = `${STACK} transition-[opacity,scale,filter] ${EASE}`;
const HIDDEN = "scale-25 opacity-0 blur-[4px]";
const FADE = `${STACK} transition-opacity ${EASE}`;

/**
 * Write to the clipboard and say so, or explain why not. The write can reject
 * (insecure context, denied permission), which is the part every hand-rolled
 * copy forgot. Returns whether it landed, so a caller can skip its own success
 * state. Exported for the places a `CopyButton` cannot go, such as a menu item.
 */
export async function copyText(
  value: string,
  toastMessage = "Copied to clipboard",
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(toastMessage);
    return true;
  } catch {
    toast.error("Couldn't copy. Copy it manually.");
    return false;
  }
}

/**
 * Copy-to-clipboard control — the one true way to copy a value (invite link,
 * academy code, payment reference, a member's phone). Handles the parts every
 * hand-rolled copy forgot: the write can reject (insecure context, denied
 * permission), so it's wrapped in try/catch with an error toast; on success the
 * icon flips to a check for ~1.5s so the click has a visible result.
 *
 * Two shapes:
 *  - default: a button with an icon + label ("Copy" → "Copied").
 *  - `iconOnly`: a compact icon button, for tight rows next to a value. Pass a
 *    `label` describing what's copied so it still has an accessible name.
 */
export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  toastMessage = "Copied to clipboard",
  iconOnly = false,
  variant = "outline",
  size = iconOnly ? "icon" : "sm",
  className,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  toastMessage?: string;
  iconOnly?: boolean;
  variant?: "outline" | "ghost" | "secondary";
  size?: "sm" | "icon" | "default";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!(await copyText(value, toastMessage))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={copy}
      aria-label={iconOnly ? label : undefined}
      className={cn(className)}
    >
      <span className="grid size-4 place-items-center">
        <CopyIcon className={cn(SWAP, copied && HIDDEN)} aria-hidden />
        <CheckIcon
          className={cn(SWAP, "text-success", !copied && HIDDEN)}
          aria-hidden
        />
      </span>
      {!iconOnly && (
        <span className="grid">
          <span
            aria-hidden={copied}
            className={cn(FADE, copied && "opacity-0")}
          >
            {label}
          </span>
          <span
            aria-hidden={!copied}
            className={cn(FADE, !copied && "opacity-0")}
          >
            {copiedLabel}
          </span>
        </span>
      )}
    </Button>
  );
}
