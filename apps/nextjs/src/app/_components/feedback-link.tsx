"use client";

import { usePathname } from "next/navigation";

import { feedbackMailto } from "@matops/domain";

import { useEntityMaybe } from "./entity";

/** Report a bug from where it happened, with the context prefilled. */
export function FeedbackLink({ className }: { className?: string }) {
  // Null on the organization screens, which name no branch.
  const entity = useEntityMaybe();
  const pathname = usePathname();

  return (
    <a
      href={feedbackMailto({ academy: entity ?? null, screen: pathname })}
      className={
        className ??
        "text-muted-foreground hover:text-foreground flex min-h-11 items-center rounded-md px-1.5 py-1 text-xs transition-colors sm:min-h-0"
      }
    >
      Something broken? Tell us
    </a>
  );
}
