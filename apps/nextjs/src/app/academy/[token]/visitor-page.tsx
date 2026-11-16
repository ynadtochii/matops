"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";

import { academyMapUrl, dropInPath } from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@matops/ui/collapsible";
import { FOCUS_RING } from "@matops/ui/motion";

import { AcademyIcon } from "~/app/_components/avatar";
import { MatLoader } from "~/app/_components/mat-loader";
import { LIST } from "~/app/_components/primitives";
import { ErrorState } from "~/app/_components/states";
import { useTRPC } from "~/trpc/react";

function useFormats(timeZone: string | undefined) {
  return useMemo(() => {
    const time = new Intl.DateTimeFormat(undefined, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const day = new Intl.DateTimeFormat(undefined, {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    return {
      time: (at: Date) => time.format(at),
      day: (key: string) => day.format(new Date(`${key}T12:00:00Z`)),
    };
  }, [timeZone]);
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:grid sm:grid-cols-[7.5rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-xs font-medium sm:pt-0.5">
        {label}
      </dt>
      <dd className="text-sm whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

export function VisitorPage({
  token,
  sharedBy,
}: {
  token: string;
  sharedBy: string | null;
}) {
  const trpc = useTRPC();
  const page = useQuery(
    trpc.dropIn.page.queryOptions({ token }, { retry: false }),
  );
  const format = useFormats(page.data?.timeZone);

  if (page.isPending) return <MatLoader label="Opening the page" />;

  if (page.isError) {
    const code = page.error.data?.code;
    if (code !== "NOT_FOUND" && code !== "BAD_REQUEST") {
      return (
        <div className="w-full max-w-sm">
          <ErrorState label="this page" onRetry={() => void page.refetch()} />
        </div>
      );
    }
    return (
      <div role="status" className="flex max-w-sm flex-col gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Link not valid
        </h1>
        <p className="text-muted-foreground text-sm">
          This link isn&apos;t valid anymore. Ask the gym for a new one.
        </p>
      </div>
    );
  }

  const data = page.data;
  const mapUrl = academyMapUrl(data.address, data.mapUrl);
  const weekLabels = ["This week", "Next week"];
  const info = [
    data.address && (
      <InfoRow key="address" label="Address">
        {data.address}
        {mapUrl && (
          <>
            {" "}
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "decoration-muted-foreground text-muted-foreground hover:text-foreground rounded-sm whitespace-nowrap underline underline-offset-2",
                FOCUS_RING,
              )}
            >
              Open in Maps
            </a>
          </>
        )}
      </InfoRow>
    ),
    data.prices && (
      <InfoRow key="prices" label="Prices">
        {data.prices}
      </InfoRow>
    ),
    data.firstVisit && (
      <InfoRow key="first-visit" label="Your first visit">
        {data.firstVisit}
      </InfoRow>
    ),
    data.rules && (
      <InfoRow key="rules" label="Rules">
        {data.rules}
      </InfoRow>
    ),
    data.contact && (
      <InfoRow key="contact" label="Contact">
        {data.contact}
      </InfoRow>
    ),
    data.more && (
      <InfoRow key="more" label="Additional info">
        {data.more}
      </InfoRow>
    ),
  ].filter(Boolean);

  return (
    <article className="flex w-full max-w-xl flex-col gap-5">
      <header className="flex items-center gap-3">
        <AcademyIcon
          src={data.iconUrl}
          name={data.name}
          className="size-11 text-base"
        />
        <div className="flex min-w-0 flex-col">
          <h1 className="text-xl font-semibold tracking-tight text-balance">
            {data.name}
          </h1>
          {data.about && (
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">
              {data.about}
            </p>
          )}
        </div>
      </header>

      {info.length > 0 && <dl className={LIST}>{info}</dl>}

      <Collapsible className="border-border bg-card rounded-lg border">
        <CollapsibleTrigger
          className={cn(
            "group flex min-h-11 w-full items-center gap-3 rounded-lg p-4 text-left",
            FOCUS_RING,
          )}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">Book a class</span>
            <span className="text-muted-foreground text-sm">
              This week and next week. No account needed.
            </span>
          </span>
          <ChevronDown
            className="text-muted-foreground size-5 shrink-0 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-6 px-4 pb-4">
            <p className="text-muted-foreground text-sm">
              Times are {data.timeZone} time.
            </p>
            {data.weeks.map((week, i) => (
              <div key={week.weekStart} className="flex flex-col gap-3">
                <h3 className="font-medium">{weekLabels[i]}</h3>
                {week.days.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {i === 0 ? "No more classes this week." : "No classes yet."}
                  </p>
                ) : (
                  week.days.map((day) => (
                    <div key={day.day} className="flex flex-col gap-2">
                      <h4 className="text-muted-foreground text-sm">
                        {format.day(day.day)}
                      </h4>
                      <ul className="flex flex-col gap-2">
                        {day.classes.map((c) => (
                          <li
                            key={c.id}
                            className="border-border bg-card flex items-center gap-3 rounded-md border p-3"
                          >
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span className="text-muted-foreground text-xs tabular-nums">
                                {format.time(c.startsAt)} · {c.durationMinutes}{" "}
                                min
                              </span>
                              <span className="truncate font-medium">
                                {c.title}
                              </span>
                            </div>
                            <Button size="sm" asChild>
                              <Link
                                href={dropInPath(token, sharedBy, c.id)}
                                aria-label={`Book ${c.title}, ${format.day(day.day)} ${format.time(c.startsAt)}`}
                              >
                                Book
                              </Link>
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </article>
  );
}
