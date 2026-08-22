"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { RouterOutputs } from "@matops/api";

/** The active academy membership, as `academy.current` returns it. */
export type Academy = NonNullable<RouterOutputs["academy"]["current"]>;

const AcademyContext = createContext<Academy | null>(null);

/**
 * The active academy, resolved once by `AppShell` and read by every screen
 * under it (`useAcademy`). The shell renders onboarding, a skeleton or an error
 * instead of its children until this is a real membership, so a screen inside
 * never has to handle "loading", "failed" or "none" again.
 */
export function AcademyProvider({
  academy,
  children,
}: {
  academy: Academy;
  children: ReactNode;
}) {
  return (
    <AcademyContext.Provider value={academy}>
      {children}
    </AcademyContext.Provider>
  );
}

/** The academy the user is looking at. Never null inside the shell. */
export function useAcademy(): Academy {
  const academy = useContext(AcademyContext);
  if (!academy) {
    throw new Error(
      "useAcademy() was called outside AppShell, which is the only place that resolves the active academy.",
    );
  }
  return academy;
}
