"use client";

import { usePathname } from "next/navigation";

import { useAcademy } from "./academy";

const FEEDBACK_EMAIL = "yevhenii.tech@gmail.com";

/** Report a bug from where it happened, with the context prefilled. */
export function FeedbackLink({ className }: { className?: string }) {
  const { name, academyId, role } = useAcademy();
  const pathname = usePathname();

  const subject = encodeURIComponent(`MatOps feedback: ${name}`);
  const body = encodeURIComponent(
    `What happened?\n\n\nWhat did you expect?\n\n\n---\nAcademy: ${name} (${academyId})\nRole: ${role}\nScreen: ${pathname}\n`,
  );

  return (
    <a
      href={`mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`}
      className={
        className ??
        "text-muted-foreground hover:text-foreground flex min-h-11 items-center rounded-md px-1 py-1 text-xs transition-colors sm:min-h-0"
      }
    >
      Something broken? Tell us
    </a>
  );
}
