"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleCheck, Search } from "lucide-react";

import { DESK_SEARCH_MIN } from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import { Callout } from "@matops/ui/callout";
import { cardClass } from "@matops/ui/card";
import { Input } from "@matops/ui/input";
import { Logo } from "@matops/ui/logo";
import { Meter } from "@matops/ui/meter";
import { FOCUS_RING, PRESS } from "@matops/ui/motion";
import { Spinner } from "@matops/ui/spinner";

import { AcademyIcon, Avatar } from "~/app/_components/avatar";
import { MatLoader } from "~/app/_components/mat-loader";
import { ErrorState } from "~/app/_components/states";
import { useTRPC } from "~/trpc/react";

const UNDO_SHOWN_SECONDS = 10;
const MIN_MS = 60_000;

interface Person {
  memberId: string;
  name: string;
  avatarUrl: string | null;
  present: boolean;
}

interface DeskClass {
  id: string;
  title: string;
  startsAt: Date;
  durationMinutes: number;
  open: boolean;
  opensAt: Date | null;
}

interface Done {
  name: string;
  classTitle: string;
  participationId: string;
  booked: boolean;
}

function useTimeLabel(timeZone: string | undefined) {
  return useMemo(() => {
    const fmt = new Intl.DateTimeFormat(undefined, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    return (at: Date) => fmt.format(at);
  }, [timeZone]);
}

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function DeskScreen({ token }: { token: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const now = useNow(15_000);
  const classes = useQuery(
    trpc.desk.classes.queryOptions(
      { token },
      { retry: false, refetchInterval: 60_000 },
    ),
  );
  const time = useTimeLabel(classes.data?.academy.timeZone);

  const [picked, setPicked] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeDone = useCallback(() => setDone(null), []);
  const search = useDebounced(query.trim(), 250);
  const searching = search.length >= DESK_SEARCH_MIN;

  const list = classes.data?.classes ?? [];
  const selected =
    list.find((c) => c.id === picked) ??
    list.find((c) => c.id === classes.data?.defaultClassId) ??
    null;
  const open = selected?.open ?? false;

  const roster = useQuery(
    trpc.desk.roster.queryOptions(
      { token, classId: selected?.id ?? "" },
      { enabled: open, refetchInterval: 30_000, retry: false },
    ),
  );
  const found = useQuery(
    trpc.desk.search.queryOptions(
      { token, classId: selected?.id ?? "", query: search },
      { enabled: open && searching, retry: false },
    ),
  );

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.desk.roster.pathFilter()),
      queryClient.invalidateQueries(trpc.desk.search.pathFilter()),
    ]);

  const checkIn = useMutation(
    trpc.desk.checkIn.mutationOptions({
      onSuccess: async (res, input) => {
        const who = [...(roster.data ?? []), ...(found.data ?? [])].find(
          (p) => p.memberId === input.memberId,
        );
        setDone({
          name: who?.name ?? "",
          classTitle: selected?.title ?? "",
          participationId: res.participationId,
          booked: res.booked,
        });
        setQuery("");
        setError(null);
        await refresh();
      },
      onError: (err) => setError(err.message || "Something went wrong."),
    }),
  );

  const undo = useMutation(
    trpc.desk.undo.mutationOptions({
      onSuccess: async () => {
        setDone(null);
        await refresh();
      },
      onError: (err) => {
        setDone(null);
        setError(err.message || "Something went wrong.");
      },
    }),
  );

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(id);
  }, [error]);

  if (classes.isPending) {
    return (
      <Centered>
        <MatLoader label="Opening check-in" />
      </Centered>
    );
  }

  if (classes.isError) {
    if (classes.error.data?.code === "NOT_FOUND") {
      return (
        <Centered>
          <p className="text-3xl font-semibold">This link no longer works</p>
          <p className="text-muted-foreground max-w-md text-lg text-pretty">
            {classes.error.message}
          </p>
        </Centered>
      );
    }
    return (
      <Centered>
        <ErrorState label="check-in" onRetry={() => void classes.refetch()} />
      </Centered>
    );
  }

  const tomorrow = classes.data.tomorrow;
  const people: Person[] = searching ? (found.data ?? []) : (roster.data ?? []);
  const busyId = checkIn.isPending ? checkIn.variables.memberId : null;
  const tap = (p: Person) => {
    if (!selected || p.present || busyId) return;
    checkIn.mutate({ token, classId: selected.id, memberId: p.memberId });
  };

  return (
    <div className="flex min-h-dvh flex-col gap-6 px-4 py-5 sm:px-8 lg:py-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {classes.data.academy.iconUrl ? (
            <AcademyIcon
              src={classes.data.academy.iconUrl}
              name={classes.data.academy.name}
              className="size-8"
            />
          ) : (
            <Logo size={28} withWordmark={false} />
          )}
          <span className="truncate text-2xl font-semibold">
            {classes.data.academy.name}
          </span>
        </div>
        <time
          dateTime={now.toISOString()}
          className="text-4xl font-semibold tabular-nums"
        >
          {time(now)}
        </time>
      </header>

      {error && (
        <Callout tone="error" className="text-lg">
          {error}
        </Callout>
      )}

      {list.length === 0 ? (
        <Centered>
          <p className="text-3xl font-semibold">No classes today or tomorrow</p>
          <p className="text-muted-foreground text-lg">
            Check-in opens here when the next class is on the schedule.
          </p>
        </Centered>
      ) : (
        <div className="flex flex-1 flex-col gap-6 lg:grid lg:grid-cols-3 lg:items-start lg:gap-8">
          <nav aria-label="Classes" className="flex flex-col gap-3">
            <h2 className="text-md text-foreground-secondary font-semibold">
              {tomorrow ? "Tomorrow" : "Today"}
            </h2>
            <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:-mx-8 sm:px-8 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
              {list.map((c) => (
                <li key={c.id} className="min-w-60 shrink-0 lg:min-w-0">
                  <ClassTile
                    cls={c}
                    now={now}
                    tomorrow={tomorrow}
                    selected={c.id === selected?.id}
                    time={time}
                    onSelect={() => {
                      setPicked(c.id);
                      setQuery("");
                    }}
                  />
                </li>
              ))}
            </ul>
          </nav>

          <section
            aria-label="Check in"
            className="flex flex-col gap-5 lg:col-span-2"
          >
            {!selected ? (
              <Prompt
                title="Which class are you here for?"
                body="Tap your class first."
              />
            ) : !open ? (
              <Prompt
                title={selected.title}
                body={
                  tomorrow
                    ? `Starts tomorrow at ${time(selected.startsAt)}. Check-in opens tomorrow.`
                    : selected.opensAt
                      ? `Starts at ${time(selected.startsAt)}. Check-in opens at ${time(selected.opensAt)}, when the class before it starts.`
                      : `Starts at ${time(selected.startsAt)}.`
                }
              />
            ) : (
              <>
                <div>
                  <h1 className="text-3xl font-semibold text-balance">
                    {selected.title}
                  </h1>
                  <p className="text-muted-foreground text-xl tabular-nums">
                    {time(selected.startsAt)} to{" "}
                    {time(
                      new Date(
                        selected.startsAt.getTime() +
                          selected.durationMinutes * MIN_MS,
                      ),
                    )}
                  </p>
                </div>

                <div className="relative">
                  <Search
                    aria-hidden
                    strokeWidth={1.5}
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-5 size-6 -translate-y-1/2"
                  />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Find your name"
                    placeholder="Find your name"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="search"
                    className="h-16 rounded-lg pl-14 text-xl sm:h-16"
                  />
                </div>

                <PeopleCaption
                  searching={searching}
                  loading={searching ? found.isPending : roster.isPending}
                  people={people}
                />

                {(searching ? found.isError : roster.isError) ? (
                  <ErrorState
                    label="the names"
                    onRetry={() =>
                      void (searching ? found.refetch() : roster.refetch())
                    }
                  />
                ) : (
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {people.map((p) => (
                      <li key={p.memberId}>
                        <NameTile
                          person={p}
                          busy={busyId === p.memberId}
                          locked={busyId !== null}
                          onTap={() => tap(p)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {done && (
        <CheckedIn
          done={done}
          undoing={undo.isPending}
          onUndo={() =>
            undo.mutate({
              token,
              participationId: done.participationId,
              booked: done.booked,
            })
          }
          onClose={closeDone}
        />
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      {children}
    </div>
  );
}

function Prompt({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-2 py-10 lg:py-24">
      <h1 className="text-3xl font-semibold text-balance">{title}</h1>
      <p className="text-muted-foreground max-w-xl text-xl text-pretty">
        {body}
      </p>
    </div>
  );
}

function ClassTile({
  cls,
  now,
  tomorrow,
  selected,
  time,
  onSelect,
}: {
  cls: DeskClass;
  now: Date;
  tomorrow: boolean;
  selected: boolean;
  time: (at: Date) => string;
  onSelect: () => void;
}) {
  const elapsed = Math.floor((now.getTime() - cls.startsAt.getTime()) / MIN_MS);
  const running = cls.open && elapsed >= 0;
  const status = running
    ? `On now, ${elapsed} min in`
    : cls.open
      ? "Open for check-in"
      : tomorrow
        ? "Opens tomorrow"
        : cls.opensAt
          ? `Opens at ${time(cls.opensAt)}`
          : "Not open yet";

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        cardClass({ level: selected ? "selected" : "flat", interactive: true }),
        FOCUS_RING,
        PRESS,
        "flex w-full flex-col gap-1 text-left transition-[background-color,scale] duration-150",
      )}
    >
      <span
        className={cn(
          "text-3xl font-semibold tabular-nums",
          !cls.open && "text-muted-foreground",
        )}
      >
        {time(cls.startsAt)}
      </span>
      <span className="truncate text-lg font-medium">{cls.title}</span>
      <span
        className={cn(
          "text-base",
          cls.open ? "text-foreground-secondary" : "text-muted-foreground",
        )}
      >
        {status}
      </span>
      {running && (
        <Meter
          value={elapsed}
          max={cls.durationMinutes}
          label={`${cls.title} progress`}
          className="mt-2"
        />
      )}
    </button>
  );
}

function PeopleCaption({
  searching,
  loading,
  people,
}: {
  searching: boolean;
  loading: boolean;
  people: Person[];
}) {
  if (loading) return <p className="text-muted-foreground text-lg">&nbsp;</p>;
  const present = people.filter((p) => p.present).length;
  const text = searching
    ? people.length === 0
      ? "No one by that name. Please talk to the desk."
      : "Tap your name."
    : people.length === 0
      ? "Nobody has booked yet. Find your name above."
      : `${people.length} booked, ${present} checked in. Tap your name.`;
  return (
    <p aria-live="polite" className="text-muted-foreground text-lg">
      {text}
    </p>
  );
}

function NameTile({
  person,
  busy,
  locked,
  onTap,
}: {
  person: Person;
  busy: boolean;
  locked: boolean;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={person.present || locked}
      aria-busy={busy}
      className={cn(
        "flex min-h-24 w-full flex-col justify-between gap-2 rounded-lg border p-4 text-left",
        "transition-[background-color,scale,opacity] duration-150 motion-reduce:transition-none",
        FOCUS_RING,
        person.present
          ? "border-border bg-transparent"
          : cn("bg-card border-card-edge hover:bg-hover", PRESS),
        locked && !busy && !person.present && "opacity-60",
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Avatar
          src={person.avatarUrl}
          name={person.name}
          className={cn("size-10 text-sm", person.present && "opacity-60")}
        />
        <span
          className={cn(
            "min-w-0 text-xl leading-snug font-medium break-words",
            person.present && "text-muted-foreground",
          )}
        >
          {person.name}
        </span>
      </span>
      {busy ? (
        <Spinner />
      ) : person.present ? (
        <span className="text-success flex items-center gap-1.5 text-base font-medium">
          <Check aria-hidden strokeWidth={2} className="size-5" />
          Checked in
        </span>
      ) : null}
    </button>
  );
}

function CheckedIn({
  done,
  undoing,
  onUndo,
  onClose,
}: {
  done: Done;
  undoing: boolean;
  onUndo: () => void;
  onClose: () => void;
}) {
  const [left, setLeft] = useState(UNDO_SHOWN_SECONDS);

  useEffect(() => {
    if (left <= 0) {
      onClose();
      return;
    }
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="desk-done-title"
      className="bg-backdrop animate-in fade-in-0 fixed inset-0 z-50 flex items-center justify-center p-4 duration-150 ease-out motion-reduce:animate-none"
    >
      <div
        className={cn(
          cardClass({ level: "raised" }),
          "flex w-full max-w-xl flex-col items-center gap-5 rounded-xl p-8 text-center sm:p-12",
        )}
      >
        <CircleCheck
          aria-hidden
          strokeWidth={1.5}
          className="text-success size-16"
        />
        <div className="flex flex-col gap-2">
          <h2 id="desk-done-title" className="text-4xl font-semibold">
            {done.name ? `${done.name}, you're in` : "You're checked in"}
          </h2>
          {done.classTitle && (
            <p className="text-muted-foreground text-xl">
              Checked in to {done.classTitle}. Have a good class.
            </p>
          )}
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <Button
            size="lg"
            variant="outline"
            className="h-14 flex-1 text-lg"
            busy={undoing}
            disabled={undoing}
            onClick={onUndo}
          >
            Not you? Undo
          </Button>
          <Button
            size="lg"
            className="h-14 flex-1 text-lg"
            autoFocus
            onClick={onClose}
          >
            Done
          </Button>
        </div>
        <Meter
          value={left}
          max={UNDO_SHOWN_SECONDS}
          label="Time left to undo"
          className="w-full"
        />
      </div>
    </div>
  );
}
