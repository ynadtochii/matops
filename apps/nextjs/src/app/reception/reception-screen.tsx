"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check } from "lucide-react";

import type { RouterOutputs } from "@matops/api";
import { defaultReceptionClass } from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import { Callout } from "@matops/ui/callout";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Mark } from "@matops/ui/logo";
import { FOCUS_RING_INSET } from "@matops/ui/motion";
import { Spinner } from "@matops/ui/spinner";

import {
  receptionActionLabel,
  ReceptionClassList,
  receptionWhen,
} from "~/app/_components/reception-classes";
import { DropInForm } from "~/app/checkin/[academyId]/drop-in-form";
import { useTRPC } from "~/trpc/react";

type ReceptionInfo = RouterOutputs["reception"]["info"];
type ReceptionMatch = RouterOutputs["reception"]["search"][number];
type ReceptionCard = RouterOutputs["reception"]["classes"][number];

const IDLE_WARN_MS = 45_000;
const IDLE_RESET_MS = 60_000;
const SUCCESS_MS = 3000;

/**
 * The entrance screen (ADR 139). Member first: somebody finds their own name,
 * then picks a class from the next few days. The order matters. Two mats
 * running at once used to make the class question unanswerable before anybody
 * knew who was asking.
 *
 * Nothing personal survives a person leaving. Every reset drops the search
 * cache and remounts the flow, and the screen resets on success, on inactivity
 * and whenever the browser comes back from the background.
 */
export function ReceptionScreen() {
  const trpc = useTRPC();
  const client = useQueryClient();
  const [generation, setGeneration] = useState(0);
  const lastActivity = useRef(0);
  const [warning, setWarning] = useState(false);
  const info = useQuery(
    trpc.reception.info.queryOptions(undefined, {
      retry: false,
      refetchInterval: 60_000,
    }),
  );
  const unauthorized = info.error?.data?.code === "UNAUTHORIZED";

  const forget = useCallback(() => {
    for (const key of [
      trpc.reception.search.pathKey(),
      trpc.reception.classes.pathKey(),
    ]) {
      void client.cancelQueries({ queryKey: key });
      client.removeQueries({ queryKey: key });
    }
    client.getMutationCache().clear();
  }, [client, trpc]);

  const reset = useCallback(() => {
    lastActivity.current = Date.now();
    setWarning(false);
    setGeneration((value) => value + 1);
    forget();
    void client.invalidateQueries({ queryKey: trpc.reception.info.pathKey() });
  }, [client, forget, trpc]);

  useEffect(() => {
    if (unauthorized) forget();
  }, [unauthorized, forget]);

  useEffect(() => {
    lastActivity.current = Date.now();
    const activity = () => {
      lastActivity.current = Date.now();
      setWarning(false);
    };
    const visibility = () => reset();
    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_RESET_MS) reset();
      else setWarning(idle >= IDLE_WARN_MS);
    }, 1000);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", reset);
    window.addEventListener("pageshow", reset);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", reset);
      window.removeEventListener("pageshow", reset);
    };
  }, [reset]);

  return (
    <main className="bg-surface-1 relative min-h-dvh overflow-hidden p-0 sm:p-5 lg:p-8">
      <div aria-hidden className="bg-grid absolute inset-0 opacity-35" />
      <div className="border-border bg-background relative mx-auto flex min-h-dvh w-full max-w-5xl flex-col overflow-hidden border-x sm:min-h-[calc(100dvh-2.5rem)] sm:rounded-xl sm:border lg:min-h-[calc(100dvh-4rem)]">
        <header className="border-border flex items-center justify-between gap-5 border-b px-5 py-4 sm:px-8 sm:py-5">
          <div className="flex min-w-0 items-center gap-3">
            <Mark size={40} className="shrink-0" />
            <div className="min-w-0">
              <p className="text-muted-foreground text-sm font-medium">
                Reception
              </p>
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                {info.data?.name ?? "Class check-in"}
              </h1>
            </div>
          </div>
          {info.data && (
            <p className="text-muted-foreground hidden items-center gap-2 text-sm font-medium sm:flex">
              <span className="bg-success size-2 rounded-full" /> Ready
            </p>
          )}
        </header>
        <div className="flex flex-1 flex-col px-5 py-7 sm:px-10 sm:py-10 lg:px-14">
          {info.isPending ? (
            <div
              className="text-md m-auto flex items-center gap-3"
              role="status"
            >
              <Spinner />
              Opening check-in…
            </div>
          ) : !info.data ? (
            <div
              className="border-border m-auto flex w-full max-w-md flex-col gap-5 rounded-xl border p-6"
              role="alert"
            >
              <p className="text-xl font-medium tracking-tight">
                {unauthorized
                  ? "This reception link is not available. Please ask staff."
                  : "Could not connect. Please try again or ask reception."}
              </p>
              {!unauthorized && (
                <Button
                  className="min-h-12"
                  onClick={() => void info.refetch()}
                >
                  Try again
                </Button>
              )}
            </div>
          ) : (
            <ReceptionEntry key={generation} info={info.data} reset={reset} />
          )}
        </div>
        {warning && (
          <aside
            role="alert"
            className="border-warning/25 bg-warning/7 text-md mx-5 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 sm:mx-8 sm:mb-8"
          >
            <p>This screen will clear soon.</p>
            <Button
              className="min-h-12"
              variant="outline"
              onClick={() => {
                lastActivity.current = Date.now();
                setWarning(false);
              }}
            >
              Keep going
            </Button>
          </aside>
        )}
        <a
          className={cn(
            "border-border text-muted-foreground hover:text-foreground mx-5 flex min-h-14 items-center border-t text-sm underline-offset-4 transition-colors hover:underline motion-reduce:transition-none sm:mx-8",
            FOCUS_RING_INSET,
          )}
          href="/sign-in"
        >
          Staff sign in
        </a>
      </div>
    </main>
  );
}

function ReceptionEntry({
  info,
  reset,
}: {
  info: ReceptionInfo;
  reset: () => void;
}) {
  const [visitor, setVisitor] = useState(false);
  const [person, setPerson] = useState<ReceptionMatch | null>(null);
  const [done, setDone] = useState<{ action: string; title: string } | null>(
    null,
  );
  const complete = !!done;

  useEffect(() => {
    if (!complete) return;
    const timer = setTimeout(reset, SUCCESS_MS);
    return () => clearTimeout(timer);
  }, [complete, reset]);

  if (visitor)
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6">
        <DropInForm
          academyId={info.academyId}
          reception
          onComplete={() => setDone({ action: "visitor", title: "" })}
        />
        <Button className="min-h-12 w-full" variant="outline" onClick={reset}>
          {complete ? "Next person" : "Back to member check-in"}
        </Button>
      </div>
    );

  if (done)
    return (
      <div
        role="status"
        className="m-auto flex w-full max-w-lg flex-col items-center gap-5 py-8 text-center"
      >
        <span
          className="border-success/30 bg-success/10 text-success flex size-20 items-center justify-center rounded-full border"
          aria-hidden
        >
          <Check className="size-10" />
        </span>
        <p className="text-muted-foreground text-md font-medium">All done</p>
        <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {done.action === "book" ? "You're booked" : "You're checked in"}
        </h2>
        <p className="text-muted-foreground text-lg">{done.title}</p>
        <Button
          className="mt-3 min-h-14 w-full rounded-lg text-base"
          onClick={reset}
        >
          Next person
        </Button>
      </div>
    );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-7 py-2 sm:py-6">
      <div className="border-border grid grid-cols-2 overflow-hidden rounded-lg border">
        <div
          className={cn(
            "flex items-center gap-3 p-3 sm:p-4",
            person ? "text-muted-foreground" : "bg-active text-foreground",
          )}
        >
          <span className="text-sm tabular-nums">01</span>
          <span className="text-md font-medium">Find your name</span>
        </div>
        <div
          className={cn(
            "border-border flex items-center gap-3 border-l p-3 sm:p-4",
            person ? "bg-active text-foreground" : "text-muted-foreground",
          )}
        >
          <span className="text-sm tabular-nums">02</span>
          <span className="text-md font-medium">Choose your class</span>
        </div>
      </div>
      {person ? (
        <ClassPicker
          info={info}
          person={person}
          onNotYou={() => setPerson(null)}
          onDone={setDone}
        />
      ) : (
        <MemberSearch onPick={setPerson} />
      )}
      {info.visitorsEnabled && !person && (
        <div className="border-border flex flex-col items-center gap-2 border-t pt-6 sm:flex-row sm:justify-between">
          <p className="text-muted-foreground text-md">
            Visiting for the first time?
          </p>
          <Button
            className="min-h-12 w-full sm:w-auto"
            variant="outline"
            onClick={() => setVisitor(true)}
          >
            Check in as a visitor
          </Button>
        </div>
      )}
      {person && (
        <Button className="min-h-12" variant="ghost" onClick={reset}>
          Start again
        </Button>
      )}
    </div>
  );
}

function MemberSearch({ onPick }: { onPick: (match: ReceptionMatch) => void }) {
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [message, setMessage] = useState("");
  const settled = query.trim() === debounced && debounced.length >= 2;
  const search = useQuery(
    trpc.reception.search.queryOptions(
      { query: debounced },
      { enabled: settled, retry: false, gcTime: 0, staleTime: 0 },
    ),
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label
          htmlFor="member-search"
          className="text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          Who are you checking in?
        </Label>
        <p className="text-muted-foreground text-md">
          Search the member list with a first or last name.
        </p>
      </div>
      <Input
        id="member-search"
        className="min-h-16 rounded-lg px-4 text-xl"
        value={query}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={80}
        placeholder="Type your first or last name"
        onChange={(event) => {
          setQuery(event.target.value);
          setMessage("");
        }}
        aria-describedby="search-status"
      />
      <p
        id="search-status"
        role="status"
        className="text-muted-foreground text-md min-h-5"
      >
        {query.trim().length < 2
          ? "Enter at least two letters."
          : !settled || search.isFetching
            ? "Finding names…"
            : search.isError
              ? "Could not load names. Please try again or ask reception."
              : search.data?.length === 0
                ? "No matching members. Please ask reception."
                : "Tap your name."}
      </p>
      {search.isError && (
        <Button
          className="min-h-12"
          variant="outline"
          onClick={() => void search.refetch()}
        >
          Try again
        </Button>
      )}
      {settled &&
        search.data?.map((match) => (
          <Button
            key={match.id}
            className="group h-auto! min-h-16! justify-between rounded-lg px-4 py-3 text-left text-lg whitespace-normal sm:min-h-16!"
            variant="outline"
            onClick={() => {
              if (match.ambiguous) {
                setMessage(
                  "More than one member has this name. Please ask reception to check you in.",
                );
                return;
              }
              onPick(match);
            }}
          >
            <span>{match.name}</span>
            <ArrowRight
              className="text-muted-foreground size-5 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
              aria-hidden
            />
          </Button>
        ))}
      {message && (
        <Callout tone="warning" role="alert" className="text-md">
          {message}
        </Callout>
      )}
    </div>
  );
}

function ClassPicker({
  info,
  person,
  onNotYou,
  onDone,
}: {
  info: ReceptionInfo;
  person: ReceptionMatch;
  onNotYou: () => void;
  onDone: (done: { action: string; title: string }) => void;
}) {
  const trpc = useTRPC();
  const [message, setMessage] = useState("");
  const [override, setOverride] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const classes = useQuery(
    trpc.reception.classes.queryOptions(
      { personId: person.id },
      { retry: false, gcTime: 0, staleTime: 0 },
    ),
  );
  const onError = (error: {
    message: string;
    data?: { code?: string } | null;
  }) => {
    setMessage(
      error.data?.code === "INTERNAL_SERVER_ERROR" ||
        error.data?.code === "BAD_REQUEST"
        ? "Could not save that. Please try again or ask reception."
        : error.message || "Please ask reception for help.",
    );
    void classes.refetch();
  };
  const checkIn = useMutation(
    trpc.reception.checkIn.mutationOptions({ onError, gcTime: 0 }),
  );
  const book = useMutation(
    trpc.reception.book.mutationOptions({ onError, gcTime: 0 }),
  );
  const busy = checkIn.isPending || book.isPending;

  const cards = classes.data ?? [];
  const chosen =
    cards.find((card) => card.id === override) ?? defaultReceptionClass(cards);
  const zone = info.timeZone ?? "UTC";

  const submit = (card: ReceptionCard) => {
    setMessage("");
    const input = { personId: person.id, classId: card.id };
    const done = () => onDone({ action: card.action, title: card.title });
    if (card.action === "book") book.mutate(input, { onSuccess: done });
    else checkIn.mutate(input, { onSuccess: done });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b pb-5">
        <div>
          <p className="text-muted-foreground text-md font-medium">
            Checking in
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {person.name}
          </p>
        </div>
        <Button
          className="min-h-12"
          variant="ghost"
          disabled={busy}
          onClick={onNotYou}
        >
          Not you?
        </Button>
      </div>
      {classes.isPending ? (
        <p role="status" className="text-md flex items-center gap-3">
          <Spinner />
          Loading classes…
        </p>
      ) : classes.isError ? (
        <div className="flex flex-col gap-3" role="alert">
          <p className="text-md">
            Could not load classes. Please try again or ask reception.
          </p>
          <Button
            className="min-h-12"
            variant="outline"
            onClick={() => void classes.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : cards.length === 0 ? (
        <p role="status" className="text-md">
          No classes coming up. Please ask reception.
        </p>
      ) : chosen && !picking ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground text-md font-medium">
              Selected class
            </p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Ready for this class?
            </h2>
            <p className="text-muted-foreground text-md">
              Tap the large button to confirm.
            </p>
          </div>
          <Button
            className="group h-auto! min-h-32! w-full flex-col items-stretch gap-5 rounded-xl px-6 py-6 text-left whitespace-normal sm:min-h-32!"
            busy={busy}
            disabled={busy}
            onClick={() => submit(chosen)}
          >
            <span className="flex items-center justify-between gap-4">
              <span className="text-2xl font-medium sm:text-3xl">
                {receptionActionLabel(chosen.action)}
              </span>
              <ArrowRight
                className="text-primary-foreground/60 size-7 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
                aria-hidden
              />
            </span>
            <span className="text-primary-foreground/70 flex w-full flex-wrap items-end justify-between gap-x-6 gap-y-1 border-t border-current/20 pt-4 text-base sm:text-lg">
              <span>{chosen.title}</span>
              <span className="shrink-0 text-sm tabular-nums sm:text-base">
                {receptionWhen(chosen, zone)}
              </span>
            </span>
          </Button>
          <Button
            className="min-h-12"
            variant="ghost"
            disabled={busy}
            onClick={() => setPicking(true)}
          >
            Choose a different class
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Choose your class
          </h2>
          {!chosen && (
            <p role="status" className="text-md">
              More than one class is on right now. Please choose yours.
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
        <p className="text-muted-foreground text-md text-center" role="status">
          Saving…
        </p>
      )}
      {message && (
        <Callout tone="error" className="text-md">
          {message}
        </Callout>
      )}
    </div>
  );
}
