"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import { Eyebrow } from "./primitives";

export function ClassTheme({ classId }: { classId: string }) {
  const trpc = useTRPC();
  const block = useQuery(
    trpc.curriculum.forClass.queryOptions({ id: classId }),
  );
  const themes = block.data?.themes ?? [];
  if (!themes.length) return null;
  return (
    <div className="border-border-strong border-l-2 pl-3">
      <Eyebrow>This week</Eyebrow>
      <ul className="mt-1 flex flex-col gap-3">
        {themes.map((on) => (
          <li key={on.theme}>
            <p className="text-sm font-medium">{on.theme}</p>
            {on.notes && (
              <p className="text-muted-foreground mt-0.5 text-sm whitespace-pre-line">
                {on.notes}
              </p>
            )}
            {on.run && (
              <p className="mt-1 text-sm whitespace-pre-line">
                <Eyebrow as="span" className="mr-1.5">
                  This run
                </Eyebrow>
                {on.run}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
