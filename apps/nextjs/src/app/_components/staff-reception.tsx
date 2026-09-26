"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";

import {
  defaultReceptionClass,
  receptionClasses,
  receptionClassWindow,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { Badge } from "@matops/ui/badge";
import { Button } from "@matops/ui/button";
import { Callout } from "@matops/ui/callout";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Spinner } from "@matops/ui/spinner";

import { useTRPC } from "~/trpc/react";
import { useEntity } from "./entity";
import { SECTION_LABEL } from "./primitives";
import {
  receptionActionLabel,
  ReceptionClassList,
  receptionWhen,
} from "./reception-classes";
import { EmptyState, ErrorState } from "./states";

const SEARCH_DEBOUNCE_MS = 200;

interface Person {
  id: string;
  name: string;
}

/**
 * Staff reception (ADR 139). The desk version of the entrance screen, and it
 * reads the same way: find the name, then act on the class already chosen.
 *
 * A class inside the check-in window records attendance through the ordinary
 * staff walk-in write, so the capacity rules, the 14-day window and the
 * correction history are the Attendance screen's. A class further out holds a
 * place through the shared member booking write instead, because the walk-in
 * write only reaches about a day ahead.
 *
 * Staff stay signed in. Nothing here is shared-device, so a class the staff
 * member deliberately chose survives the whole queue.
 */
export function StaffReception() {
  const trpc = useTRPC();
  const client = useQueryClient();
  const academy = useEntity();
  const [now, setNow] = useState(() => new Date());
  const [override, setOverride] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [person, setPerson] = useState<Person | null>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const timer = setTimeout(
      () => setDebounced(query.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [query]);

  const zone = academy.timeZone ?? "UTC";
  const classWindow = useMemo(
    () => receptionClassWindow(now, zone),
    [now, zone],
  );
  const classes = useQuery(
    trpc.class.week.queryOptions({
      from: classWindow.from.toISOString(),
      to: classWindow.to.toISOString(),
    }),
  );
  const cards = useMemo(
    () =>
      receptionClasses(classes.data ?? [], now, {
        timeZone: zone,
        bookingWindowDays: academy.bookingWindowDays,
      }),
    [classes.data, now, zone, academy.bookingWindowDays],
  );
  const chosen =
    cards.find((card) => card.id === override) ?? defaultReceptionClass(cards);
  // A class further out than the check-in window holds a place instead of
  // recording attendance, exactly as it does on the entrance screen.
  const booking = chosen?.action === "book";

  const settled = query.trim() === debounced && debounced.length >= 2;
  const search = useQuery(
    trpc.attendance.searchMembers.queryOptions(
      { query: debounced },
      { enabled: settled, retry: false },
    ),
  );
  const roster = useQuery({
    ...trpc.attendance.list.queryOptions({ id: chosen?.id ?? "" }),
    enabled: !!chosen,
    refetchInterval: 60_000,
  });
  const held = useMemo(() => {
    const rows = roster.data?.rows ?? [];
    return {
      present: new Set(
        rows
          .filter((row) => row.attendanceStatus === "present")
          .map((row) => row.studentId),
      ),
      booked: new Set(
        rows
          .filter((row) => row.bookingStatus === "booked")
          .map((row) => row.studentId),
      ),
    };
  }, [roster.data]);

  const clearPerson = () => {
    setPerson(null);
    setQuery("");
    setDebounced("");
    setMessage("");
  };
  const settle = async () => {
    clearPerson();
    setDone("yes");
    await client.invalidateQueries({
      queryKey: trpc.attendance.list.queryKey({ id: chosen?.id ?? "" }),
    });
  };
  const onError = (error: {
    message: string;
    data?: { code?: string } | null;
  }) => {
    setDone("");
    setMessage(
      error.data?.code === "INTERNAL_SERVER_ERROR" ||
        error.data?.code === "BAD_REQUEST"
        ? "Could not save that. Try again."
        : error.message || "Could not save that. Try again.",
    );
  };
  const checkIn = useMutation(
    trpc.attendance.addWalkIn.mutationOptions({ onSuccess: settle, onError }),
  );
  const book = useMutation(
    trpc.booking.bookFor.mutationOptions({ onSuccess: settle, onError }),
  );
  const busy = checkIn.isPending || book.isPending;

  const submit = () => {
    if (!chosen || !person) return;
    setMessage("");
    const input = { classId: chosen.id, personId: person.id };
    if (booking) book.mutate(input);
    else checkIn.mutate(input);
  };

  return (
    <section className="flex flex-col gap-5">
      <div className="border-border bg-grid-small overflow-hidden rounded-lg border">
        <div className="bg-background/90 flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-md font-medium">{academy.name}</p>
            <p className={cn("text-muted-foreground mt-0.5", SECTION_LABEL)}>
              Times in {zone}
            </p>
          </div>
          {chosen && (
            <div className="text-left sm:text-right">
              <p className="text-sm font-medium tabular-nums">
                {receptionWhen(chosen, zone)}
              </p>
              <p className="text-muted-foreground text-sm">{chosen.title}</p>
            </div>
          )}
        </div>
      </div>

      {classes.isPending ? (
        <div
          className="border-border text-muted-foreground flex min-h-48 items-center justify-center gap-3 rounded-lg border"
          role="status"
        >
          <Spinner />
          <span>Loading classes…</span>
        </div>
      ) : classes.isError ? (
        <Callout
          tone="error"
          title="Could not load classes."
          className="max-w-md"
        >
          <Button
            className="mt-2 self-start"
            variant="outline"
            onClick={() => void classes.refetch()}
          >
            Try again
          </Button>
        </Callout>
      ) : cards.length === 0 ? (
        <div role="status">
          <EmptyState title="No upcoming classes">
            Nothing is scheduled in the next few days.
          </EmptyState>
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
          <div className="border-border bg-card flex min-w-0 flex-col gap-5 rounded-lg border p-4 sm:p-5">
            <div className="border-border flex items-center justify-between gap-3 border-b pb-4">
              <div>
                <p className={cn("text-muted-foreground", SECTION_LABEL)}>
                  Desk check-in
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">
                  {person ? person.name : "Find a member"}
                </h2>
              </div>
              {person && (
                <Button variant="ghost" disabled={busy} onClick={clearPerson}>
                  Not this person
                </Button>
              )}
            </div>

            {person ? (
              <>
                {chosen && !picking && (
                  <div className="flex flex-col gap-3">
                    <Button
                      className="h-auto! min-h-24! w-full flex-col items-start gap-2 rounded-lg px-5 py-5 text-left whitespace-normal sm:min-h-24!"
                      busy={busy}
                      disabled={
                        busy ||
                        (booking ? held.booked : held.present).has(person.id)
                      }
                      onClick={submit}
                    >
                      <span className="text-xl font-medium">
                        {(booking ? held.booked : held.present).has(person.id)
                          ? booking
                            ? "Already booked"
                            : "Already checked in"
                          : receptionActionLabel(chosen.action)}
                      </span>
                      <span className="text-primary-foreground/70 flex w-full flex-wrap justify-between gap-2 text-sm">
                        <span>{chosen.title}</span>
                        <span className="tabular-nums">
                          {receptionWhen(chosen, zone)}
                        </span>
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setPicking(true)}
                    >
                      Change class
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <Label htmlFor="staff-reception-search">Member name</Label>
                <Input
                  id="staff-reception-search"
                  className="text-md min-h-12"
                  value={query}
                  autoComplete="off"
                  maxLength={80}
                  placeholder="Type a first or last name"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setMessage("");
                    setDone("");
                  }}
                  aria-describedby="staff-reception-status"
                />
                <p
                  id="staff-reception-status"
                  role="status"
                  className="text-muted-foreground text-sm"
                >
                  {query.trim().length < 2
                    ? "Enter at least two letters."
                    : !settled || search.isFetching
                      ? "Searching…"
                      : search.isError
                        ? "Could not search the roster."
                        : search.data?.length === 0
                          ? "No matching members."
                          : "Tap a name."}
                </p>
                {settled &&
                  search.data?.map((match) => (
                    <Button
                      key={match.id}
                      className="group min-h-12 justify-between rounded-lg text-left whitespace-normal"
                      variant="outline"
                      onClick={() => {
                        setPerson({ id: match.id, name: match.name });
                        setDone("");
                      }}
                    >
                      <span>{match.name}</span>
                      <ArrowRight
                        className="text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                        aria-hidden
                      />
                    </Button>
                  ))}
              </div>
            )}

            {(picking || !chosen) && (
              <div className="flex flex-col gap-3">
                <h3 className="text-lg font-semibold tracking-tight">
                  Choose a class
                </h3>
                {!chosen && (
                  <p role="status" className="text-muted-foreground text-sm">
                    More than one class is on right now, so nothing is chosen
                    for you.
                  </p>
                )}
                <ReceptionClassList
                  cards={cards}
                  timeZone={zone}
                  disabled={busy}
                  onPick={(card) => {
                    setOverride(card.id);
                    setPicking(false);
                    setMessage("");
                  }}
                />
              </div>
            )}

            {busy && (
              <p className="text-muted-foreground text-sm" role="status">
                Saving…
              </p>
            )}
            {done && (
              <Callout tone="success" role="status">
                <p className="text-foreground font-medium">
                  {booking ? "Member booked." : "Member checked in."}
                </p>
              </Callout>
            )}
            {message && <Callout tone="error">{message}</Callout>}
          </div>

          {chosen && !picking && (
            <aside className="border-border bg-card flex min-w-0 flex-col overflow-hidden rounded-lg border">
              <div className="border-border flex items-end justify-between gap-3 border-b p-4 sm:p-5">
                <div>
                  <p className={cn("text-muted-foreground", SECTION_LABEL)}>
                    {booking ? "Booking list" : "Live register"}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight">
                    {chosen.title}
                  </h2>
                </div>
                <span className="text-3xl font-medium tabular-nums">
                  {booking ? held.booked.size : held.present.size}
                </span>
              </div>
              {roster.isPending ? (
                <p className="text-muted-foreground p-5 text-sm" role="status">
                  Loading the register…
                </p>
              ) : roster.isError ? (
                <div className="p-4">
                  <ErrorState
                    label="the register"
                    onRetry={() => void roster.refetch()}
                  />
                </div>
              ) : roster.data.rows.length === 0 ? (
                <div className="border-border bg-grid-small m-4 flex min-h-40 items-center justify-center rounded-md border">
                  <p className="bg-background text-muted-foreground max-w-44 rounded-md p-3 text-center text-sm">
                    {booking ? "No bookings yet." : "Nobody is checked in yet."}
                  </p>
                </div>
              ) : (
                <ul className="divide-border divide-y px-4">
                  {roster.data.rows.map((row) => (
                    <li
                      key={row.studentId}
                      className="flex min-h-12 items-center justify-between gap-3 py-2"
                    >
                      <span className="text-md min-w-0 truncate">
                        {row.name}
                      </span>
                      <Badge
                        tone={
                          row.attendanceStatus === "present"
                            ? "success"
                            : row.attendanceStatus === "absent"
                              ? "error"
                              : "neutral"
                        }
                      >
                        {row.attendanceStatus === "present"
                          ? "Present"
                          : row.attendanceStatus === "absent"
                            ? "Absent"
                            : "Booked"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
