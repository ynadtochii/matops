"use client";

import { useState } from "react";

import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";

const colors = [
  {
    name: "Page",
    token: "--background",
    className: "bg-background",
    role: "The canvas",
  },
  {
    name: "Surface",
    token: "--card",
    className: "bg-card",
    role: "Content on the page",
  },
  {
    name: "Quiet fill",
    token: "--muted",
    className: "bg-muted",
    role: "Hover and small details",
  },
  {
    name: "Border",
    token: "--border",
    className: "bg-border",
    role: "Structural edges",
  },
  {
    name: "Ink",
    token: "--foreground",
    className: "bg-foreground",
    role: "Primary text",
  },
  {
    name: "Secondary ink",
    token: "--muted-foreground",
    className: "bg-muted-foreground",
    role: "Supporting text",
  },
  {
    name: "Identity",
    token: "--brand",
    className: "bg-brand",
    role: "Links and selection",
  },
  {
    name: "Focus",
    token: "--ring",
    className: "bg-ring",
    role: "Keyboard focus",
  },
] as const;

const states = [
  { label: "Ready", className: "bg-success/10 text-success border-success/25" },
  {
    label: "Needs review",
    className: "bg-warning/10 text-warning border-warning/25",
  },
  { label: "Information", className: "bg-info/10 text-info border-info/25" },
  { label: "Error", className: "bg-error/10 text-error border-error/25" },
] as const;

const examples = [
  {
    id: "fundamentals",
    title: "Fundamentals",
    detail: "Tuesday · 18:00",
    note: "12 booked",
    status: "Ready",
  },
  {
    id: "nogi",
    title: "No-gi sparring",
    detail: "Wednesday · 19:30",
    note: "4 places left",
    status: "Needs review",
  },
  {
    id: "open-mat",
    title: "Open mat",
    detail: "Saturday · 10:00",
    note: "All levels",
    status: "Ready",
  },
] as const;

type Example = (typeof examples)[number];

function ShowcaseSection({
  id,
  number,
  title,
  description,
  children,
}: {
  id: string;
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="border-border scroll-mt-8 border-t py-12 sm:py-16"
    >
      <div className="mb-8 grid gap-4 sm:grid-cols-[12rem_1fr] sm:gap-8">
        <p className="text-brand-strong font-mono text-xs tracking-wider">
          {number} / SYSTEM
        </p>
        <div>
          <h2
            id={`${id}-title`}
            className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            {title}
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function DesignSystemScreen() {
  const [message, setMessage] = useState(
    "Choose a button to preview its feedback.",
  );
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<Example["id"]>("fundamentals");
  const filtered = examples.filter((item) =>
    item.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selected = examples.find((item) => item.id === selectedId);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-8 lg:px-10">
      <header className="relative overflow-hidden py-12 sm:py-20">
        <div
          aria-hidden
          className="bg-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent)] opacity-35"
        />
        <div className="relative max-w-3xl">
          <p className="text-brand-strong mb-5 font-mono text-xs font-medium tracking-[0.18em] uppercase">
            Interface reference / 01
          </p>
          <h1 className="text-foreground max-w-[16ch] text-4xl leading-[1.08] font-semibold tracking-[-0.04em] text-balance sm:text-6xl">
            Quiet structure. Clear action.
          </h1>
          <p className="text-muted-foreground mt-6 max-w-xl text-base leading-7 text-pretty sm:text-lg">
            A compact visual language for useful screens. Neutral surfaces
            organize information; color and weight show what needs attention.
          </p>
          <div className="mt-8 flex flex-wrap gap-2" aria-label="Page sections">
            {[
              ["#principles", "Principles"],
              ["#color", "Color"],
              ["#type", "Type"],
              ["#components", "Components"],
              ["#patterns", "Patterns"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="border-border bg-background hover:bg-muted focus-visible:ring-ring rounded-md border px-3 py-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </header>

      <ShowcaseSection
        id="principles"
        number="01"
        title="Principles"
        description="Rules come before swatches. Each choice has a job, so the interface stays consistent when content changes."
      >
        <div className="border-border bg-border grid gap-px overflow-hidden rounded-lg border md:grid-cols-3">
          {[
            [
              "01",
              "One clear priority",
              "Give the primary action space. Let supporting actions stay quiet.",
            ],
            [
              "02",
              "Density follows the task",
              "Use open space to explain. Bring controls and data together when people need to work.",
            ],
            [
              "03",
              "States are part of the design",
              "Show selection, focus, progress and failure with more than color alone.",
            ],
          ].map(([number, title, description]) => (
            <div key={number} className="bg-card p-6 sm:p-7">
              <span className="text-brand-strong font-mono text-xs">
                {number}
              </span>
              <h3 className="mt-8 text-base font-semibold">{title}</h3>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                {description}
              </p>
            </div>
          ))}
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="color"
        number="02"
        title="Color by role"
        description="These swatches use the current theme tokens. Switch themes in the app shell to inspect both sets without maintaining a second palette here."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {colors.map((color) => (
            <div
              key={color.token}
              className="border-border bg-card overflow-hidden rounded-lg border"
            >
              <div
                className={`border-border h-24 border-b ${color.className}`}
              />
              <div className="p-3.5">
                <p className="text-sm font-medium">{color.name}</p>
                <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                  {color.token}
                </p>
                <p className="text-muted-foreground mt-2 text-xs">
                  {color.role}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground me-2 text-xs font-medium">
            Meaning, not decoration
          </span>
          {states.map((state) => (
            <span
              key={state.label}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${state.className}`}
            >
              {state.label}
            </span>
          ))}
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="type"
        number="03"
        title="Type and rhythm"
        description="A small number of roles covers page hierarchy, readable copy, and values people scan quickly."
      >
        <div className="border-border bg-card grid overflow-hidden rounded-lg border lg:grid-cols-[1fr_15rem]">
          <div className="divide-border divide-y px-5 sm:px-8">
            <div className="py-7">
              <p className="text-muted-foreground mb-3 font-mono text-[11px] tracking-wider uppercase">
                Display / page
              </p>
              <p className="text-3xl font-semibold tracking-tight sm:text-4xl">
                The work, at a glance.
              </p>
            </div>
            <div className="py-7">
              <p className="text-muted-foreground mb-3 font-mono text-[11px] tracking-wider uppercase">
                Heading / section
              </p>
              <p className="text-xl font-semibold tracking-tight">
                A useful section heading
              </p>
            </div>
            <div className="py-7">
              <p className="text-muted-foreground mb-3 font-mono text-[11px] tracking-wider uppercase">
                Copy / explanation
              </p>
              <p className="max-w-[58ch] text-sm leading-6">
                Keep instructions close to the thing they explain. Write for
                people who need to make a decision, not for a mood board.
              </p>
            </div>
          </div>
          <div className="border-border bg-background border-t p-6 lg:border-s lg:border-t-0">
            <p className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
              Data / numeric
            </p>
            <p className="mt-8 font-mono text-5xl font-medium tracking-tight tabular-nums">
              12<span className="text-muted-foreground text-2xl">/18</span>
            </p>
            <p className="text-muted-foreground mt-3 text-sm">Places booked</p>
            <div className="bg-border my-8 h-px" />
            <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
              TUE · 18:00
            </p>
          </div>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="components"
        number="04"
        title="Basic components"
        description="Use the actual shared controls. The examples below show priority, fields and feedback rather than introducing new button styles."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="border-border bg-card rounded-lg border p-5 sm:p-7">
            <h3 className="text-base font-semibold">Actions</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              One filled action; supporting choices stay lighter.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button onClick={() => setMessage("Primary action selected.")}>
                Primary action
              </Button>
              <Button
                variant="secondary"
                onClick={() => setMessage("Secondary action selected.")}
              >
                Secondary
              </Button>
              <Button
                variant="outline"
                onClick={() => setMessage("Outline action selected.")}
              >
                Outline
              </Button>
              <Button
                variant="ghost"
                onClick={() => setMessage("Quiet action selected.")}
              >
                Quiet
              </Button>
              <Button disabled>Unavailable</Button>
            </div>
            <p
              role="status"
              className="text-muted-foreground border-border mt-7 border-t pt-4 text-sm"
            >
              {message}
            </p>
          </div>
          <div className="border-border bg-card rounded-lg border p-5 sm:p-7">
            <h3 className="text-base font-semibold">Field</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              A label names the value; the placeholder shows an example.
            </p>
            <label
              htmlFor="design-search"
              className="mt-6 block text-sm font-medium"
            >
              Search sample classes
            </label>
            <Input
              id="design-search"
              type="search"
              placeholder="Fundamentals"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="mt-2"
            />
            <p className="text-muted-foreground mt-3 text-xs">
              The sample list below responds to this search.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="border-border bg-card rounded-lg border p-5 sm:p-7">
            <p className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
              Standard card
            </p>
            <h3 className="mt-4 text-lg font-semibold">One thing to review</h3>
            <p className="text-muted-foreground mt-2 max-w-sm text-sm leading-6">
              A hairline separates this content from the page. It does not need
              a large shadow.
            </p>
          </div>
          <div className="border-border bg-background rounded-lg border p-5 sm:p-7">
            <p className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
              Quiet card
            </p>
            <h3 className="mt-4 text-lg font-semibold">A supporting choice</h3>
            <p className="text-muted-foreground mt-2 max-w-sm text-sm leading-6">
              A flush surface keeps navigation and secondary content from
              competing with the main action.
            </p>
          </div>
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="patterns"
        number="05"
        title="A working pattern"
        description="Search narrows the list; selection opens details. This sample shows how the same components work together on a task screen."
      >
        <div className="border-border bg-card grid overflow-hidden rounded-lg border md:grid-cols-[minmax(0,1fr)_minmax(17rem,0.85fr)]">
          <div className="border-border min-w-0 md:border-e">
            <div className="border-border flex items-center justify-between gap-3 border-b px-5 py-4">
              <h3 className="text-sm font-semibold">Sample classes</h3>
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {filtered.length} shown
              </span>
            </div>
            {filtered.length === 0 ? (
              <p className="text-muted-foreground px-5 py-10 text-sm">
                No classes match “{query}”. Try another name.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {filtered.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={selectedId === item.id}
                      onClick={() => setSelectedId(item.id)}
                      className="hover:bg-muted focus-visible:ring-ring aria-pressed:bg-brand-wash flex min-h-16 w-full items-center justify-between gap-4 px-5 py-3 text-start transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {item.title}
                        </span>
                        <span className="text-muted-foreground mt-1 block text-xs">
                          {item.detail}
                        </span>
                      </span>
                      <span className="text-muted-foreground shrink-0 font-mono text-xs">
                        {item.note}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-background px-5 py-6 sm:p-7">
            <p className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
              Selected detail
            </p>
            {selected && filtered.some((item) => item.id === selected.id) ? (
              <>
                <h3 className="mt-5 text-xl font-semibold tracking-tight">
                  {selected.title}
                </h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  {selected.detail}
                </p>
                <div className="border-border mt-7 flex justify-between gap-4 border-t pt-4 text-sm">
                  <span className="text-muted-foreground">Availability</span>
                  <span className="font-mono">{selected.note}</span>
                </div>
                <div className="border-border mt-4 flex justify-between gap-4 border-t pt-4 text-sm">
                  <span className="text-muted-foreground">State</span>
                  <span>{selected.status}</span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground mt-5 text-sm">
                Select a class from the results to see its details.
              </p>
            )}
          </div>
        </div>
      </ShowcaseSection>
      <p className="text-muted-foreground border-border border-t pt-6 text-xs leading-5">
        Private reference page · No navigation link · Examples are local to this
        page
      </p>
    </div>
  );
}
