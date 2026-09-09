"use client";

import { usePathname } from "next/navigation";

import { useEntityMaybe } from "./entity";

export const CONTACT_EMAIL = "yevhenii.tech@gmail.com";

/** Report a bug from where it happened, with the context prefilled. */
export function FeedbackLink({ className }: { className?: string }) {
  // Null on the organization screens, which name no branch.
  const entity = useEntityMaybe();
  const pathname = usePathname();

  const subject = encodeURIComponent(
    `MatOps feedback: ${entity?.name ?? "the gym"}`,
  );
  const where = entity
    ? `Academy: ${entity.name} (${entity.academyId})\nRole: ${entity.role}\n`
    : "";
  const body = encodeURIComponent(
    `What happened?\n\n\nWhat did you expect?\n\n\n---\n${where}Screen: ${pathname}\n`,
  );

  return (
    <a
      href={`mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`}
      className={
        className ??
        "text-muted-foreground hover:text-foreground flex min-h-11 items-center rounded-md px-1 py-1 text-xs transition-colors sm:min-h-0"
      }
    >
      Something broken? Tell us
    </a>
  );
}
