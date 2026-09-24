"use client";

import type { ReceptionAction, ReceptionClassCard } from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";

import { SECTION_LABEL } from "./primitives";

/**
 * How both reception screens draw a class (ADR 139). The entrance tablet and
 * the staff desk keep their own state and their own procedures; only the
 * drawing is shared, so staff persistence cannot leak into an unattended
 * screen.
 *
 * Every time is formatted in the BRANCH zone, never the viewer's, so a coach
 * checking the desk from home still reads the gym's own clock.
 */

type Card = Pick<ReceptionClassCard, "id" | "title" | "startsAt" | "dayOffset">;

type When = Pick<Card, "startsAt" | "dayOffset">;

export function receptionDay(card: When, timeZone: string): string {
  if (card.dayOffset === 0) return "Today";
  if (card.dayOffset === 1) return "Tomorrow";
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "long",
  }).format(card.startsAt);
}

export function receptionTime(card: When, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(card.startsAt);
}

export function receptionWhen(card: When, timeZone: string): string {
  return `${receptionDay(card, timeZone)} ${receptionTime(card, timeZone)}`;
}

export function receptionActionLabel(action: ReceptionAction): string {
  if (action === "check-in") return "Check in";
  return action === "book" ? "Book" : "Not open yet";
}

/**
 * Every offered class, one heading per day that actually has one. The headings
 * come from the rows themselves rather than a fixed Today/Tomorrow pair, so a
 * branch with nothing on Thursday simply has no Thursday heading.
 */
export function ReceptionClassList({
  cards,
  timeZone,
  disabled = false,
  onPick,
}: {
  cards: (Card & { action: ReceptionAction })[];
  timeZone: string;
  disabled?: boolean;
  onPick: (card: Card & { action: ReceptionAction }) => void;
}) {
  const days = [...new Set(cards.map((card) => card.dayOffset))];
  return (
    <div className="flex flex-col gap-6">
      {days.map((offset) => {
        const rows = cards.filter((card) => card.dayOffset === offset);
        const first = rows[0];
        if (!first) return null;
        return (
          <section key={offset} className="flex flex-col gap-2.5">
            <h3 className={cn("text-muted-foreground", SECTION_LABEL)}>
              {receptionDay(first, timeZone)}
            </h3>
            {rows.map((card) => (
              <Button
                key={card.id}
                className="group hover:border-foreground h-auto! min-h-16! justify-between gap-4 px-4 py-3 text-left whitespace-normal sm:min-h-16!"
                variant="outline"
                disabled={disabled || card.action === "closed"}
                onClick={() => onPick(card)}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span>{card.title}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {receptionTime(card, timeZone)}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium">
                  {receptionActionLabel(card.action)}
                </span>
              </Button>
            ))}
          </section>
        );
      })}
    </div>
  );
}
