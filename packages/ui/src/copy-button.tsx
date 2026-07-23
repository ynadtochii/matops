"use client";

import { CheckIcon, CopyIcon } from "@radix-ui/react-icons";
import { useState } from "react";

import { cn } from "@matops/ui";
import { Button } from "./button";
import { toast } from "./toast";

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
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(toastMessage);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Copy it manually.");
    }
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
      {copied ? (
        <CheckIcon className="text-success" aria-hidden />
      ) : (
        <CopyIcon aria-hidden />
      )}
      {!iconOnly && <span>{copied ? copiedLabel : label}</span>}
    </Button>
  );
}
