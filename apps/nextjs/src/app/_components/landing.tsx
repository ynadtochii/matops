import Link from "next/link";
import Script from "next/script";
import { GoogleAnalytics } from "@next/third-parties/google";
import {
  CalendarDays,
  ChartNoAxesColumn,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import { cn } from "@matops/ui";
import { buttonClass } from "@matops/ui/button";
import { Logo, Mark } from "@matops/ui/logo";
import { FOCUS_RING } from "@matops/ui/motion";

import type { Consent } from "~/lib/consent";
import { consentDefaultScript } from "~/lib/consent";
import {
  GA_MEASUREMENT_ID,
  INDEXABLE,
  SITE_DESCRIPTION,
  SITE_URL,
} from "~/lib/site";
import { display, MatFloor } from "./auth-door";
import { ConsentBanner, CookieSettingsButton } from "./consent-banner";
import { blockSkin, hueSkin } from "./discipline-skin";
import { ENTER, stagger } from "./primitives";

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "MatOps",
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "MatOps",
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      name: "MatOps",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

const FOOTER_LINK = cn(
  "hover:text-foreground rounded-sm transition-colors motion-reduce:transition-none",
  FOCUS_RING,
);

export function Landing({ consent }: { consent: Consent | null }) {
  return (
    <div className="bg-background relative isolate flex min-h-dvh flex-col overflow-hidden">
      {INDEXABLE && (
        <>
          <Script id="consent-default" strategy="afterInteractive">
            {consentDefaultScript(consent)}
          </Script>
          <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />
        </>
      )}
      <ConsentBanner initial={consent} analytics={INDEXABLE} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c"),
        }}
      />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className={cn("rounded-md", FOCUS_RING)}>
          <Logo size={24} />
        </Link>
        <Link href="/sign-in" className={buttonClass({ variant: "ghost" })}>
          Sign in
        </Link>
      </header>

      <main className="flex-1">
        <section className="relative isolate px-4 pt-12 sm:px-6 sm:pt-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 hidden h-[70vh] bg-[radial-gradient(ellipse_55%_60%_at_50%_0%,rgb(255_255_255/0.07),transparent)] dark:block"
          />
          <MatFloor />

          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <h1
              className={cn(
                display.className,
                "from-foreground to-muted-foreground max-w-[14ch] bg-linear-to-b bg-clip-text pb-1 text-5xl leading-[1.02] tracking-[-0.01em] text-balance text-transparent sm:text-7xl dark:drop-shadow-[0_0_24px_rgb(255_255_255/0.12)]",
                ENTER,
              )}
            >
              Run the mat, not the paperwork.
            </h1>
            <p
              className={cn(
                "text-muted-foreground mt-5 max-w-md text-base leading-relaxed text-pretty",
                ENTER,
              )}
              style={stagger(1)}
            >
              Classes, students, bookings and attendance for a BJJ academy. Your
              students book from their phone. You stay on the mat.
            </p>
            <div
              className={cn("mt-8 flex flex-wrap justify-center gap-2", ENTER)}
              style={stagger(2)}
            >
              <Link
                href="/start"
                className={buttonClass({ variant: "primary", size: "lg" })}
              >
                Start a gym
              </Link>
              <Link
                href="/sign-in"
                className={buttonClass({ variant: "secondary", size: "lg" })}
              >
                Sign in
              </Link>
            </div>
          </div>

          <ScheduleShot />
        </section>

        <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
          <h2 className="sr-only">What MatOps does</h2>
          <ul className="grid gap-14 lg:grid-cols-3 lg:gap-8">
            <Point
              title="You approve who trains"
              body="Students join with your link or a 6-digit code. Nobody books a class until you approve them."
            >
              <Requests />
            </Point>
            <Point
              title="Students book from their phone"
              body="They see your week and book or cancel in the app. You see who is coming before class starts."
            >
              <Booking />
            </Point>
            <Point
              title="Changes reach everyone booked"
              body="Cancel or change a class and every student booked gets an email and a push. No group chat needed."
            >
              <Notice />
            </Point>
          </ul>
        </section>

        <section className="border-border border-t px-4 py-24 sm:px-6 sm:py-28">
          <div className="mx-auto flex max-w-xl flex-col items-center text-center">
            <h2
              className={cn(
                display.className,
                "text-4xl leading-[1.05] tracking-[-0.01em] text-balance sm:text-5xl",
              )}
            >
              Open your gym in a minute.
            </h2>
            <p className="text-muted-foreground mt-4 max-w-sm text-base leading-relaxed text-pretty">
              Name your academy, pick its time zone, and share the join link
              with your students.
            </p>
            <Link
              href="/start"
              className={cn(
                "mt-8",
                buttonClass({ variant: "primary", size: "lg" }),
              )}
            >
              Start a gym
            </Link>
            <p className="text-muted-foreground mt-6 text-sm">
              Training at a gym on MatOps?{" "}
              <Link
                href="/sign-in"
                className={cn(
                  "text-foreground decoration-muted-foreground rounded-sm font-medium underline underline-offset-4 hover:decoration-current",
                  FOCUS_RING,
                )}
              >
                Sign in
              </Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl items-center justify-between px-4 py-6 text-xs sm:px-6">
          <Logo size={18} withWordmark={false} />
          <div className="flex items-center gap-4">
            <CookieSettingsButton className={FOOTER_LINK} />
            <Link href="/privacy" className={FOOTER_LINK}>
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Point({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-6">
      <div aria-hidden className="flex items-end lg:h-64">
        {children}
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-muted-foreground text-base leading-relaxed text-pretty">
          {body}
        </p>
      </div>
    </li>
  );
}

const HOUR_H = 52;
const GAP_H = 22;
const ROWS = [7, null, 12, 13, null, 18, 19, 20] as const;
const DAYS = ["Mon 5", "Tue 6", "Wed 7", "Thu 8", "Fri 9", "Sat 10", "Sun 11"];
const TODAY = 2;
const DISCIPLINES = ["Gi", "No-Gi", "Kids"];

interface MockClass {
  day: number;
  at: [number, number];
  minutes: number;
  title: string;
  coach: string;
  hue: number | null;
  booked: number;
  capacity: number;
  pending?: number;
  cancelled?: boolean;
}

const CLASSES: MockClass[] = [
  {
    day: 0,
    at: [7, 0],
    minutes: 60,
    title: "Morning Gi",
    coach: "Rui",
    hue: 0,
    booked: 8,
    capacity: 16,
  },
  {
    day: 2,
    at: [7, 0],
    minutes: 60,
    title: "Morning Gi",
    coach: "Rui",
    hue: 0,
    booked: 11,
    capacity: 16,
  },
  {
    day: 4,
    at: [7, 0],
    minutes: 60,
    title: "Morning Gi",
    coach: "Rui",
    hue: 0,
    booked: 6,
    capacity: 16,
  },
  {
    day: 1,
    at: [12, 0],
    minutes: 60,
    title: "Lunch No-Gi",
    coach: "Joana",
    hue: 1,
    booked: 9,
    capacity: 16,
  },
  {
    day: 3,
    at: [12, 0],
    minutes: 60,
    title: "Lunch No-Gi",
    coach: "Joana",
    hue: 1,
    booked: 12,
    capacity: 16,
  },
  {
    day: 5,
    at: [12, 0],
    minutes: 90,
    title: "Open mat",
    coach: "Everyone",
    hue: null,
    booked: 10,
    capacity: 30,
  },
  {
    day: 0,
    at: [18, 0],
    minutes: 60,
    title: "Kids",
    coach: "Marta",
    hue: 2,
    booked: 14,
    capacity: 20,
  },
  {
    day: 2,
    at: [18, 0],
    minutes: 60,
    title: "Kids",
    coach: "Marta",
    hue: 2,
    booked: 17,
    capacity: 20,
  },
  {
    day: 0,
    at: [19, 0],
    minutes: 60,
    title: "Fundamentals",
    coach: "Rui",
    hue: 0,
    booked: 18,
    capacity: 16,
  },
  {
    day: 1,
    at: [19, 0],
    minutes: 90,
    title: "No-Gi",
    coach: "Joana",
    hue: 1,
    booked: 12,
    capacity: 20,
    pending: 2,
  },
  {
    day: 2,
    at: [19, 0],
    minutes: 90,
    title: "Advanced Gi",
    coach: "Rui",
    hue: 0,
    booked: 15,
    capacity: 20,
  },
  {
    day: 3,
    at: [19, 0],
    minutes: 90,
    title: "No-Gi",
    coach: "Joana",
    hue: 1,
    booked: 0,
    capacity: 20,
    cancelled: true,
  },
  {
    day: 4,
    at: [19, 0],
    minutes: 60,
    title: "Competition",
    coach: "Joana",
    hue: 1,
    booked: 9,
    capacity: 12,
  },
];

const offsets = new Map<number, number>();
let gridHeight = 0;
for (const row of ROWS) {
  if (row !== null) offsets.set(row, gridHeight);
  gridHeight += row === null ? GAP_H : HOUR_H;
}

const pad = (n: number) => String(n).padStart(2, "0");
const topOf = ([h, m]: readonly [number, number]) =>
  (offsets.get(h) ?? 0) + (m / 60) * HOUR_H;

const NAV = [
  { label: "Dashboard", icon: LayoutGrid },
  { label: "Schedule", icon: CalendarDays, current: true },
  { label: "Students", icon: Users },
  { label: "Coaches", icon: ChartNoAxesColumn },
  { label: "Settings", icon: SlidersHorizontal },
];

function ScheduleShot() {
  return (
    <div
      role="img"
      aria-label="The MatOps week schedule: classes from Monday to Sunday, colored by discipline, with how many students booked each one."
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-8 fill-mode-backwards mx-auto mt-16 max-w-6xl duration-700 ease-out motion-reduce:animate-none sm:mt-20",
      )}
      style={{ animationDelay: "160ms" }}
    >
      <div className="edge-rim-card shadow-float flex overflow-hidden rounded-xl [mask-image:linear-gradient(to_bottom,#000_75%,transparent)]">
        <div className="bg-sidebar border-sidebar-border hidden w-48 shrink-0 flex-col gap-3 border-r p-2 lg:flex">
          <div className="flex items-center gap-2 px-1.5 pt-1.5">
            <Mark size={20} />
            <span className="text-sm font-semibold">Alma BJJ</span>
          </div>
          <div className="flex flex-col gap-px">
            {NAV.map(({ label, icon: Icon, current }) => (
              <span
                key={label}
                className={cn(
                  "flex h-7 items-center gap-2 rounded-md px-1.5 text-sm",
                  current
                    ? "bg-sidebar-accent text-foreground font-medium"
                    : "text-sidebar-foreground",
                )}
              >
                <Icon aria-hidden />
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-1 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xl font-semibold">Schedule</span>
              <span className="text-muted-foreground hidden text-sm sm:inline">
                5-11 October
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className={buttonClass({ variant: "secondary", size: "icon" })}
              >
                <ChevronLeft aria-hidden />
              </span>
              <span className={buttonClass({ variant: "secondary" })}>
                Today
              </span>
              <span
                className={buttonClass({ variant: "secondary", size: "icon" })}
              >
                <ChevronRight aria-hidden />
              </span>
            </div>
          </div>

          <ul className="mt-4 mb-3 flex flex-wrap justify-end gap-4">
            {DISCIPLINES.map((name, hue) => (
              <li key={name} className="flex items-center gap-1.5">
                <span className={cn("h-3 w-5 rounded-xs", hueSkin(hue))} />
                <span className="text-muted-foreground text-xs">{name}</span>
              </li>
            ))}
          </ul>

          <div className="border-border overflow-hidden rounded-lg border">
            <div className="min-w-[40rem]">
              <div className="border-border grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-b">
                <span />
                {DAYS.map((d, i) => (
                  <span
                    key={d}
                    className={cn(
                      "border-border border-l px-2 py-2 text-xs",
                      i === TODAY
                        ? "text-foreground bg-hover/50 font-semibold"
                        : "text-muted-foreground",
                    )}
                  >
                    {d}
                  </span>
                ))}
              </div>

              <div className="relative" style={{ height: gridHeight }}>
                {ROWS.map((row, i) => {
                  const top = ROWS.slice(0, i).reduce<number>(
                    (sum, r) => sum + (r === null ? GAP_H : HOUR_H),
                    0,
                  );
                  return (
                    <div
                      key={i}
                      className={cn(
                        "border-border absolute inset-x-0 border-t first:border-t-0",
                        row === null && "bg-surface-1",
                      )}
                      style={{ top, height: row === null ? GAP_H : HOUR_H }}
                    >
                      {row !== null && (
                        <span className="text-muted-foreground text-2xs absolute top-1 left-0 w-[3.25rem] pr-2 text-right tabular-nums">
                          {pad(row)}:00
                        </span>
                      )}
                    </div>
                  );
                })}

                <div className="absolute inset-y-0 right-0 left-[3.25rem] grid grid-cols-7">
                  {DAYS.map((d, day) => (
                    <div
                      key={d}
                      className={cn(
                        "border-border relative border-l",
                        day === TODAY && "bg-hover/50",
                      )}
                    >
                      {CLASSES.filter((c) => c.day === day).map((c) => (
                        <ClassBlock key={`${c.title}-${c.at[0]}`} c={c} />
                      ))}
                    </div>
                  ))}
                </div>

                <div
                  className="pointer-events-none absolute inset-x-0 z-20"
                  style={{ top: topOf([18, 40]) }}
                >
                  <div className="bg-foreground absolute right-0 left-[3.25rem] h-px" />
                  <span className="bg-foreground text-background text-2xs absolute top-1/2 left-0 -translate-y-1/2 rounded-xs px-1 tabular-nums">
                    18:40
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClassBlock({ c }: { c: MockClass }) {
  const height = Math.max((c.minutes / 60) * HOUR_H - 3, 34);
  const over = c.booked > c.capacity;
  return (
    <div
      className={cn(
        "absolute inset-x-0.5 z-10 overflow-hidden rounded-sm px-1.5 py-1",
        blockSkin(c.hue, c.cancelled ?? false),
      )}
      style={{ top: topOf(c.at), height }}
    >
      <p className="text-2xs flex items-baseline gap-1 tabular-nums">
        <span className="text-muted-foreground">
          {pad(c.at[0])}:{pad(c.at[1])}
        </span>
        {c.cancelled && <span className="text-error-text">cancelled</span>}
      </p>
      <p
        className={cn(
          "truncate text-xs leading-tight font-medium",
          c.cancelled && "line-through",
        )}
      >
        {c.title}
      </p>
      {height > 52 && (
        <p className="text-muted-foreground text-2xs truncate leading-tight">
          {c.coach}
        </p>
      )}
      {!c.cancelled && (
        <p
          className={cn(
            "text-2xs absolute right-1.5 bottom-1 tabular-nums",
            over ? "text-warning font-semibold" : "text-muted-foreground",
          )}
        >
          {c.booked}/{c.capacity}
          {c.pending && <span className="text-foreground"> +{c.pending}</span>}
        </p>
      )}
    </div>
  );
}

function Requests() {
  const people = [
    { initials: "MF", name: "Marta Ferreira", note: "Blue belt, 2 stripes" },
    { initials: "TA", name: "Tiago Alves", note: "Never trained" },
  ];
  return (
    <div className="edge-rim-card shadow-lift w-full rounded-lg">
      <div className="border-border flex items-center gap-2 border-b px-4 py-3">
        <span className="text-sm font-medium">Requests</span>
        <span className="bg-active text-foreground text-2xs rounded-full px-1.5 font-medium tabular-nums">
          2
        </span>
      </div>
      <div className="divide-border divide-y">
        {people.map((p) => (
          <div key={p.name} className="flex items-center gap-3 px-4 py-3">
            <span className="bg-active text-foreground-secondary flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
              {p.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="text-muted-foreground truncate text-xs">{p.note}</p>
            </div>
            <span className={buttonClass({ variant: "primary", size: "sm" })}>
              Approve
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Booking() {
  const rows = [
    {
      time: "18:00",
      title: "Kids",
      coach: "Marta",
      hue: 2,
      spots: "17/20",
      booked: false,
    },
    {
      time: "19:00",
      title: "Advanced Gi",
      coach: "Rui",
      hue: 0,
      spots: "15/20",
      booked: true,
    },
  ];
  return (
    <div className="edge-rim-card shadow-lift mx-auto w-full max-w-72 rounded-[1.75rem] p-2">
      <div className="bg-background rounded-[1.25rem] px-3 pt-4 pb-3">
        <p className="px-1 text-base font-semibold">Wednesday</p>
        <p className="text-muted-foreground px-1 text-xs">7 October</p>
        <div className="mt-3 flex flex-col gap-2">
          {rows.map((r) => (
            <div
              key={r.title}
              className={cn(
                "flex items-center gap-3 rounded-md px-2.5 py-2",
                hueSkin(r.hue),
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-2xs tabular-nums">
                  {r.time}, {r.spots}
                </p>
                <p className="truncate text-sm font-medium">{r.title}</p>
                <p className="text-muted-foreground text-2xs">{r.coach}</p>
              </div>
              <span
                className={buttonClass({
                  variant: r.booked ? "outline" : "primary",
                  size: "sm",
                })}
              >
                {r.booked ? "Cancel" : "Book"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Notice() {
  return (
    <div className="relative w-full pb-3">
      <div className="edge-rim-card absolute inset-x-4 bottom-0 h-10 rounded-xl opacity-60" />
      <div className="edge-rim-card shadow-float relative flex gap-3 rounded-xl p-3.5">
        <Mark size={32} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">
              No-Gi on Thursday is cancelled
            </p>
            <span className="text-muted-foreground text-2xs shrink-0">now</span>
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm text-pretty">
            Alma BJJ cancelled No-Gi at 19:00. Lunch No-Gi runs as usual.
          </p>
        </div>
      </div>
    </div>
  );
}
