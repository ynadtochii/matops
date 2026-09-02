"use client";

import Link from "next/link";

import { entityHref } from "@matops/domain";
import { Logo } from "@matops/ui/logo";

import { useOrganization } from "./entity";
import { AddAcademyButton } from "./entity-selector";
import { JoinByCode } from "./join-by-code";

/**
 * Every academy this person may open, and nothing about any one of them. It is
 * the way out of a mat that does not mean choosing another, and it is where a
 * session with several academies lands. Wave 5 puts the figures here.
 */
export function OverviewScreen() {
  const { entities, canAdd } = useOrganization();

  if (entities.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <JoinByCode />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 p-6">
      <Logo size={30} />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Your academies
        </h1>
        <p className="text-muted-foreground text-sm">
          {canAdd
            ? "Pick a mat to run, or add another."
            : "Pick a mat to open."}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {entities.map((e) => (
          <li key={e.id}>
            <Link
              href={entityHref(e.id)}
              className="border-border hover:bg-muted flex items-center justify-between rounded-lg border px-4 py-3 transition-colors"
            >
              <span className="truncate font-medium">{e.name}</span>
              <span className="text-muted-foreground text-xs">Open</span>
            </Link>
          </li>
        ))}
      </ul>
      {canAdd && <AddAcademyButton />}
    </div>
  );
}
