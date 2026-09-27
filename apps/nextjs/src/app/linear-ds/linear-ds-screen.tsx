"use client";

import type { KeyboardEvent } from "react";
import { useId, useState, useSyncExternalStore } from "react";
import Link from "next/link";

import { useTheme } from "@matops/ui/theme";

import type { Issue, Label, Person, Priority, Status } from "./primitives";
import s from "./linear-ds.module.css";
import { MoreComponents } from "./more-components";
import {
  Avatar,
  cx,
  ISSUES,
  Kbd,
  LabelChip,
  LABELS,
  PEOPLE,
  PRIORITY_LABEL,
  PriorityIcon,
  SearchIcon,
  Specimen,
  STATUS_CYCLE,
  STATUS_LABEL,
  StatusIcon,
} from "./primitives";

interface Swatch {
  name: string;
  token: string;
  source: string;
  role: string;
}

const SURFACES: Swatch[] = [
  { name: "Level 0", token: "--bg-0", source: "--background", role: "Page" },
  {
    name: "Level 1",
    token: "--bg-1",
    source: "--surface-1",
    role: "Panel, sidebar",
  },
  {
    name: "Level 2",
    token: "--bg-2",
    source: "--surface-2",
    role: "Group header, strip",
  },
  {
    name: "Level 3",
    token: "--bg-3",
    source: "--surface-3",
    role: "Row hover",
  },
  { name: "Fill", token: "--fill-1", source: "--muted", role: "Quiet fill" },
  {
    name: "Fill strong",
    token: "--fill-2",
    source: "--active",
    role: "Selected item",
  },
];

const ROLES: Swatch[] = [
  {
    name: "Raised",
    token: "--raised",
    source: "--raised",
    role: "Card, input, dialog",
  },
  {
    name: "Floating",
    token: "--float-bg",
    source: "--floating",
    role: "Menu, tooltip, toast",
  },
  {
    name: "Hover",
    token: "--fill-hover",
    source: "--hover",
    role: "Nav item hover",
  },
  {
    name: "Active",
    token: "--fill-active",
    source: "--active",
    role: "Selected, pressed",
  },
  {
    name: "Track",
    token: "--track",
    source: "--track",
    role: "Switch, progress",
  },
];

const INKS: Swatch[] = [
  {
    name: "Primary",
    token: "--fg-1",
    source: "--foreground",
    role: "Titles, values, active text",
  },
  {
    name: "Secondary",
    token: "--fg-2",
    source: "--foreground-secondary",
    role: "Body inside cards, labels",
  },
  {
    name: "Tertiary",
    token: "--fg-3",
    source: "--muted-foreground",
    role: "Descriptions, nav, metadata",
  },
  {
    name: "Quaternary",
    token: "--fg-4",
    source: "--foreground-faint",
    role: "IDs, dates, placeholders. Not for reading text",
  },
];

const LINES: Swatch[] = [
  {
    name: "Hairline",
    token: "--line-t",
    source: "--foreground at 5%",
    role: "Default edge",
  },
  {
    name: "Hairline strong",
    token: "--line-t-strong",
    source: "--foreground at 8%",
    role: "Cards",
  },
  { name: "Line 1", token: "--line-1", source: "--border", role: "Panel edge" },
  {
    name: "Line 2",
    token: "--line-2",
    source: "--field-hover",
    role: "Input hover",
  },
  {
    name: "Line 3",
    token: "--line-3",
    source: "--border-strong",
    role: "Strongest edge",
  },
  {
    name: "Field edge",
    token: "--field-line",
    source: "--input",
    role: "Input edge. 3:1 in light",
  },
  {
    name: "Control edge",
    token: "--control",
    source: "--control",
    role: "Checkbox, radio, switch",
  },
];

const SIGNALS: Swatch[] = [
  {
    name: "Brand",
    token: "--brand",
    source: "--brand",
    role: "Focus, done, on switch, brand button",
  },
  {
    name: "Brand strong",
    token: "--accent-hover",
    source: "--brand-strong",
    role: "Link hover, brand text",
  },
  {
    name: "Ring halo",
    token: "--accent-tint",
    source: "--ring-halo",
    role: "Focus halo around a field",
  },
  {
    name: "Green",
    token: "--green",
    source: "--success",
    role: "In review, success",
  },
  {
    name: "Yellow",
    token: "--yellow",
    source: "page only",
    role: "In progress",
  },
  { name: "Orange", token: "--orange", source: "--warning", role: "Urgent" },
  { name: "Red", token: "--red", source: "--error", role: "Bug, error" },
  { name: "Blue", token: "--blue", source: "--info", role: "Label" },
  {
    name: "Error text",
    token: "--error-text",
    source: "--error-text",
    role: "Error messages",
  },
  {
    name: "Discipline 1",
    token: "--discipline-1",
    source: "--discipline-1",
    role: "Label",
  },
];

const TYPE = [
  {
    name: "Display",
    spec: "64 / 64, 510, -0.022em",
    style: {
      fontSize: 64,
      lineHeight: 1,
      fontWeight: 510,
      letterSpacing: "-0.022em",
    },
    text: "Run the mat",
  },
  {
    name: "Heading",
    spec: "48 / 48, 510, -0.022em",
    style: {
      fontSize: 48,
      lineHeight: 1,
      fontWeight: 510,
      letterSpacing: "-0.022em",
    },
    text: "Plan the week",
  },
  {
    name: "Title 3",
    spec: "24 / 32, 510, -0.012em",
    style: {
      fontSize: 24,
      lineHeight: 1.33,
      fontWeight: 510,
      letterSpacing: "-0.012em",
    },
    text: "Fundamentals, Tuesday 18:00",
  },
  {
    name: "Title 2",
    spec: "20 / 27, 590, -0.012em",
    style: {
      fontSize: 20,
      lineHeight: 1.33,
      fontWeight: 590,
      letterSpacing: "-0.012em",
    },
    text: "Faster check-in at the desk",
  },
  {
    name: "Body large",
    spec: "17 / 27, 400",
    style: { fontSize: 17, lineHeight: 1.6, color: "var(--fg-3)" },
    text: "Every class, member and payment in one place, built for the people who run the gym.",
  },
  {
    name: "Body",
    spec: "15 / 24, 400, -0.011em",
    style: {
      fontSize: 15,
      lineHeight: 1.6,
      letterSpacing: "-0.011em",
      color: "var(--fg-2)",
    },
    text: "Twelve students booked. Two are new this week and one still owes September dues.",
  },
  {
    name: "Small",
    spec: "14 / 21, 400, -0.013em",
    style: {
      fontSize: 14,
      lineHeight: 1.5,
      letterSpacing: "-0.013em",
      color: "var(--fg-3)",
    },
    text: "Render the roster before the booking count syncs.",
  },
  {
    name: "Mini, interface",
    spec: "13 / 20, 510, -0.01em",
    style: {
      fontSize: 13,
      lineHeight: 1.5,
      fontWeight: 510,
      letterSpacing: "-0.01em",
    },
    text: "Book a lead onto a future class",
  },
  {
    name: "Micro",
    spec: "12 / 17, 400",
    style: { fontSize: 12, lineHeight: 1.4, color: "var(--fg-4)" },
    text: "MAT-212  Updated 4 min ago",
  },
];

const RADII = [
  { r: "4px", name: "4", use: "Key hint, icon button" },
  { r: "6px", name: "6", use: "Input, segment" },
  { r: "8px", name: "8", use: "Menu item, small panel" },
  { r: "9px", name: "9", use: "Card nested in a panel" },
  { r: "12px", name: "12", use: "Panel, menu, app frame" },
  { r: "9999px", name: "Pill", use: "Button, nav link, chip" },
];

const COMMANDS = [
  { icon: "plus", label: "Create issue", keys: ["C"] },
  { icon: "user", label: "Assign to me", keys: ["I"] },
  { icon: "status", label: "Change status", keys: ["S"] },
  { icon: "priority", label: "Set priority", keys: ["P"] },
  { icon: "label", label: "Add label", keys: ["L"] },
  { icon: "link", label: "Copy issue link", keys: ["⌘", "⇧", ","] },
] as const;

const PRINCIPLES = [
  {
    title: "Light is the hierarchy",
    body: "Four surface steps and four text steps do the layout work. A panel is one step lighter than the surface that holds it.",
  },
  {
    title: "Color carries meaning",
    body: "The page is grey. Color shows up on status, priority and labels, plus one violet accent for focus and selection.",
  },
  {
    title: "Edges, not shadows",
    body: "Borders are white at 5 to 8 percent opacity, and half a pixel on nested cards. Shadows are only for things that float, like menus.",
  },
  {
    title: "Tight, medium-weight type",
    body: "Inter at weight 510 with negative tracking for headings. Interface text is 13px. Two stylistic alternates, cv01 and ss03, stay on everywhere.",
  },
  {
    title: "The product is the picture",
    body: "The homepage shows real issues, boards and threads instead of illustrations. The examples here use the real matops backlog.",
  },
  {
    title: "Fast, quiet motion",
    body: "State changes take 150ms on an ease-out curve. Nothing animates in on its own. A spinner appears only while work is running.",
  },
];

export function LinearDsScreen() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  return (
    <div className={s.root}>
      <header className={s.header}>
        <div className={s.headerInner}>
          <a href="#top" className={s.wordmark}>
            <Mark />
            Linear DS
          </a>
          <nav className={s.navLinks} aria-label="Sections">
            {[
              "Principles",
              "Color",
              "Type",
              "Shape",
              "Components",
              "Patterns",
            ].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className={cx(s.btn, s.btnGhost)}
              >
                {item}
              </a>
            ))}
          </nav>
          <div className={s.headerEnd}>
            <div className={s.segmented} role="group" aria-label="Theme">
              {(["light", "dark"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={s.segment}
                  aria-pressed={mounted && resolvedTheme === option}
                  onClick={() => setTheme(option)}
                >
                  {option === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
            <Link href="/" className={cx(s.btn, s.btnPrimary)}>
              Back to matops
            </Link>
          </div>
        </div>
      </header>

      <main className={s.main} id="top">
        <section className={s.hero} aria-labelledby="lds-title">
          <h1 id="lds-title" className={s.display}>
            The matops design system
          </h1>
          <p className={s.lede}>
            The structure of Linear's interface, painted with the matops product
            tokens. Every color here is the one the product uses, in both
            themes.
          </p>
          <div className={s.heroActions}>
            <a href="#components" className={cx(s.btn, s.btnPrimary, s.btnLg)}>
              See the components
            </a>
            <a href="#color" className={cx(s.btn, s.btnSecondary, s.btnLg)}>
              See the tokens
            </a>
          </div>
        </section>

        <section
          className={s.section}
          id="principles"
          aria-labelledby="h-principles"
        >
          <h2 id="h-principles" className={s.statement}>
            <strong>Six rules hold it together.</strong> Each one is visible in
            the numbers below, not only in the mood of the page.
          </h2>
          <ul className={s.principles}>
            {PRINCIPLES.map((p) => (
              <li key={p.title} className={s.principle}>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className={s.section} id="color" aria-labelledby="h-color">
          <h2 id="h-color" className={s.statement}>
            <strong>Almost everything is grey.</strong> Depth comes from small
            steps in lightness, and hue is saved for things that mean something.
          </h2>

          <h3 className={s.subhead}>Surfaces</h3>
          <p className={s.note}>
            Each step is about 2 to 3 points lighter than the one below. Hover
            moves an element up one step. Dark is the default and keeps Linear's
            dark values. Light starts from Linear's light theme, with some text,
            brand and edge colors darkened to pass WCAG AA.
          </p>
          <Swatches items={SURFACES} />

          <h3 className={s.subhead}>Surface roles</h3>
          <p className={s.note}>
            Components paint with these roles, not with the levels. In dark they
            point at the levels above. In light, raised and floating surfaces
            turn white and hover fills turn translucent, because Linear's light
            greys are too close together to show nesting.
          </p>
          <Swatches items={ROLES} />

          <h3 className={s.subhead}>Text</h3>
          <p className={s.note}>
            Four levels. In dark, the quaternary grey is below 4.5:1. The
            product keeps it on purpose, only for IDs, dates and placeholders
            that a reader can skip. In light, tertiary and quaternary are darker
            than Linear's so every level reaches 4.5:1.
          </p>
          <div className={s.inkRow}>
            {INKS.map((ink) => (
              <div key={ink.name} className={s.inkItem}>
                <span style={{ color: `var(${ink.token})` }}>
                  {ink.name}: {ink.role}
                </span>
                <span>{ink.source}</span>
              </div>
            ))}
          </div>

          <h3 className={s.subhead}>Lines</h3>
          <p className={s.note}>
            Translucent hairlines (white in dark, black in light) adapt to any
            surface under them. Solid greys are used where an input needs a firm
            edge.
          </p>
          <Swatches items={LINES} />

          <h3 className={s.subhead}>Accent and status</h3>
          <p className={s.note}>
            One matops violet for focus, links and selection. Status colors
            never appear as large fills, only as icons, dots and thin tints.
            Each theme has its own set, so status icons reach 3:1 in light as
            well as dark. Yellow has no product token and lives on this page
            only.
          </p>
          <Swatches items={SIGNALS} />
        </section>

        <section className={s.section} id="type" aria-labelledby="h-type">
          <h2 id="h-type" className={s.statement}>
            <strong>One family, many weights.</strong> Inter Variable at 400,
            510, 590 and 680, with tracking that tightens as the size grows.
          </h2>
          {TYPE.map((t) => (
            <div key={t.name} className={s.typeRow}>
              <div className={s.typeSpec}>
                <b>{t.name}</b>
                {t.spec}
              </div>
              <div
                className={s.typeSample}
                style={{
                  ...t.style,
                  fontSize: `min(${t.style.fontSize}px, ${t.style.fontSize / 5.2}vw + 12px)`,
                }}
              >
                {t.text}
              </div>
            </div>
          ))}
        </section>

        <section className={s.section} id="shape" aria-labelledby="h-shape">
          <h2 id="h-shape" className={s.statement}>
            <strong>Radius follows nesting.</strong> The outer frame is rounder,
            the things inside it are tighter, and actions are pills.
          </h2>
          <div className={s.shapes}>
            {RADII.map((r) => (
              <div
                key={r.name}
                className={s.shape}
                style={{ borderRadius: r.r }}
              >
                <span>
                  <b>{r.name}</b>
                  {r.use}
                </span>
              </div>
            ))}
          </div>

          <h3 className={s.subhead}>Elevation and motion</h3>
          <div className={s.motion}>
            <div className={s.motionItem}>
              <b>Flat</b>
              Panels and rows. A hairline edge and a lighter surface, no shadow.
            </div>
            <div className={s.motionItem}>
              <b>Lift</b>
              Cards and the primary button. Four stacked shadows under 8% black,
              felt more than seen.
            </div>
            <div className={s.motionItem}>
              <b>Float</b>
              Menus and dialogs. A 0.5px white ring plus a deep, soft shadow.
            </div>
            <div className={s.motionItem}>
              <b>Duration</b>
              <code>150ms</code> for hover, press and toggles.
            </div>
            <div className={s.motionItem}>
              <b>Curve</b>
              <code>cubic-bezier(.25, .46, .45, .94)</code>, ease-out quad.
            </div>
            <div className={s.motionItem}>
              <b>Reduced motion</b>
              Transitions and the spinner stop when the system asks for it.
            </div>
          </div>
        </section>

        <section
          className={s.section}
          id="components"
          aria-labelledby="h-components"
        >
          <h2 id="h-components" className={s.statement}>
            <strong>Basic components.</strong> Built only from the tokens above.
            Everything here works with a keyboard.
          </h2>

          <div className={s.gallery}>
            <ButtonSpecimen />
            <FieldSpecimen />
            <Specimen
              title="Chips, avatars and key hints"
              note="Labels are a dot plus text on a hairline pill. Key hints sit beside the action they trigger."
            >
              {(Object.keys(LABELS) as Label[]).map((l) => (
                <LabelChip key={l} label={l} />
              ))}
              <div className={s.avatarStack}>
                {(Object.keys(PEOPLE) as Person[]).map((p) => (
                  <Avatar key={p} person={p} large />
                ))}
              </div>
              <span className={s.chip}>
                Search <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </Specimen>
            <Specimen
              title="Status and priority icons"
              note="Shape carries the meaning, so the icon still reads without color."
            >
              {(Object.keys(STATUS_LABEL) as Status[]).map((st) => (
                <span key={st} className={s.chip}>
                  <StatusIcon status={st} />
                  {STATUS_LABEL[st]}
                </span>
              ))}
              {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                <span key={p} className={s.chip}>
                  <PriorityIcon priority={p} />
                  {PRIORITY_LABEL[p]}
                </span>
              ))}
            </Specimen>
            <SwitchSpecimen />
            <CommandMenu />
            <IssueList />
            <Board />
          </div>
        </section>

        <section
          className={s.section}
          id="patterns"
          aria-labelledby="h-patterns"
        >
          <h2 id="h-patterns" className={s.statement}>
            <strong>Patterns built from the same parts.</strong> Menus, dialogs,
            feedback, navigation and data, each with its keyboard behavior and
            its empty, loading and error states.
          </h2>
          <MoreComponents />
        </section>

        <footer className={s.footer}>
          A study of the public design of{" "}
          <a
            href="https://linear.app/homepage"
            rel="noreferrer"
            target="_blank"
          >
            linear.app
          </a>
          . Not affiliated with Linear. The colors are the matops product
          tokens.
        </footer>
      </main>
    </div>
  );
}

function subscribeNever() {
  return () => undefined;
}

function Swatches({ items }: { items: Swatch[] }) {
  return (
    <div className={s.ramp}>
      {items.map((c) => (
        <div key={c.name} className={s.swatch}>
          <div
            className={s.swatchChip}
            style={{ background: `var(${c.token})` }}
          />
          <div className={s.swatchMeta}>
            <div className={s.swatchName}>{c.name}</div>
            <div className={s.swatchValue}>
              {c.token} {c.source}
            </div>
            <div className={s.swatchRole}>{c.role}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ButtonSpecimen() {
  const [saving, setSaving] = useState(false);

  function save() {
    setSaving(true);
    setTimeout(() => setSaving(false), 1400);
  }

  return (
    <Specimen
      title="Buttons"
      note="Pills at 32px. The main action is inverted light grey. Only one per view."
    >
      <button type="button" className={cx(s.btn, s.btnPrimary)}>
        Create issue
      </button>
      <button type="button" className={cx(s.btn, s.btnSecondary)}>
        Filter
      </button>
      <button type="button" className={cx(s.btn, s.btnGhost)}>
        Cancel
      </button>
      <button type="button" className={cx(s.btn, s.btnBrand)}>
        Upgrade plan
      </button>
      <button type="button" className={cx(s.btn, s.btnDanger)}>
        Delete class
      </button>
      <button
        type="button"
        className={cx(s.btn, s.btnPrimary)}
        onClick={save}
        disabled={saving}
        aria-busy={saving}
      >
        {saving && <span className={s.spinner} aria-hidden />}
        {saving ? "Saving" : "Save changes"}
      </button>
      <button type="button" className={cx(s.btn, s.btnSecondary)} disabled>
        Archived
      </button>
      <button type="button" className={cx(s.btn, s.btnSecondary, s.btnSm)}>
        Small
      </button>
      <button type="button" className={cx(s.btn, s.btnSecondary, s.btnLg)}>
        Large
      </button>
    </Specimen>
  );
}

function FieldSpecimen() {
  const [phone, setPhone] = useState("91 234 5");
  const phoneId = useId();
  const nameId = useId();
  const searchId = useId();
  const invalid = phone.replace(/\D/g, "").length < 9;

  return (
    <Specimen
      title="Fields"
      note="Solid grey edge, accent border and a soft tint on focus. Errors sit under the field."
      stack
    >
      <div className={s.field}>
        <label className={s.label} htmlFor={nameId}>
          Class name
        </label>
        <input
          id={nameId}
          className={s.input}
          placeholder="Fundamentals"
          aria-describedby={`${nameId}-hint`}
        />
        <span id={`${nameId}-hint`} className={s.hint}>
          Students see this on the schedule.
        </span>
      </div>
      <div className={s.field}>
        <label className={s.label} htmlFor={phoneId}>
          Phone
        </label>
        <input
          id={phoneId}
          className={s.input}
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-invalid={invalid}
          aria-describedby={`${phoneId}-msg`}
        />
        <span id={`${phoneId}-msg`} className={invalid ? s.error : s.hint}>
          {invalid ? "Enter all 9 digits of the phone number." : "Looks good."}
        </span>
      </div>
      <div className={s.searchWrap}>
        <label htmlFor={searchId} className={s.srOnly}>
          Search
        </label>
        <SearchIcon />
        <input id={searchId} className={s.input} placeholder="Search issues" />
        <span className={s.searchKbd}>
          <Kbd>/</Kbd>
        </span>
      </div>
      <input
        className={s.input}
        style={{ maxWidth: 360 }}
        placeholder="Disabled"
        aria-label="Disabled example"
        disabled
      />
    </Specimen>
  );
}

function SwitchSpecimen() {
  const [settings, setSettings] = useState({
    theme: true,
    reminders: false,
    booking: true,
  });
  const rows = [
    { key: "theme", label: "Show the week's theme to students" },
    { key: "reminders", label: "Send dues reminders on the 5th" },
    { key: "booking", label: "Allow public booking" },
  ] as const;

  return (
    <Specimen
      title="Switches"
      note="Off is a grey track. On is the brand violet. The whole row is clickable."
      stack
    >
      {rows.map((row) => (
        <label key={row.key} className={s.switchRow}>
          <button
            type="button"
            role="switch"
            aria-checked={settings[row.key]}
            className={s.switch}
            onClick={() =>
              setSettings((prev) => ({ ...prev, [row.key]: !prev[row.key] }))
            }
          />
          {row.label}
        </label>
      ))}
    </Specimen>
  );
}

function CommandMenu() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [ran, setRan] = useState<string | null>(null);
  const listId = useId();
  const results = COMMANDS.filter((c) =>
    c.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const current = Math.min(active, Math.max(results.length - 1, 0));

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((current + 1) % Math.max(results.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((current - 1 + results.length) % Math.max(results.length, 1));
    } else if (e.key === "Enter" && results[current]) {
      e.preventDefault();
      setRan(results[current].label);
    }
  }

  return (
    <Specimen
      title="Command menu"
      note="The one floating surface. Type to filter, arrows to move, Enter to run."
      wide
    >
      <div className={s.menu}>
        <div className={s.menuContext}>
          <span className={s.chip}>MAT-212</span>
        </div>
        <input
          className={s.menuInput}
          placeholder="Type a command or search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={
            results[current] ? `${listId}-${current}` : undefined
          }
          aria-label="Command"
        />
        <ul
          id={listId}
          role="listbox"
          className={s.menuList}
          aria-label="Commands"
        >
          {results.map((c, i) => (
            <li
              key={c.label}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === current}
              className={s.menuItem}
              onMouseMove={() => setActive(i)}
              onClick={() => setRan(c.label)}
            >
              <CommandIcon name={c.icon} />
              <span>{c.label}</span>
              <span className={s.menuKeys}>
                {c.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        {results.length === 0 && (
          <p className={s.empty}>No command matches “{query}”.</p>
        )}
      </div>
      <p
        className={s.hint}
        aria-live="polite"
        style={{ width: "100%", textAlign: "center" }}
      >
        {ran ? `Ran “${ran}” on MAT-212.` : "Nothing run yet."}
      </p>
    </Specimen>
  );
}

type View = "all" | "active" | "backlog";

function IssueList() {
  const [issues, setIssues] = useState(ISSUES);
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const searchId = useId();

  const inView = (i: Issue) =>
    view === "all"
      ? true
      : view === "backlog"
        ? i.status === "backlog"
        : i.status !== "backlog" && i.status !== "done";
  const visible = issues.filter(
    (i) =>
      inView(i) && i.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const counts: Record<View, number> = {
    all: issues.length,
    active: issues.filter((i) => i.status !== "backlog" && i.status !== "done")
      .length,
    backlog: issues.filter((i) => i.status === "backlog").length,
  };
  const groups = STATUS_CYCLE.map((st) => ({
    status: st,
    items: visible.filter((i) => i.status === st),
  })).filter((g) => g.items.length > 0);

  function advance(id: string) {
    setIssues((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              status:
                STATUS_CYCLE[
                  (STATUS_CYCLE.indexOf(i.status) + 1) % STATUS_CYCLE.length
                ] ?? "backlog",
            }
          : i,
      ),
    );
  }

  return (
    <div className={cx(s.specimen, s.specimenWide)}>
      <div className={s.specimenHead}>
        <h3>Issue list</h3>
        <p>
          The main dense view. 40px rows grouped by status. Click a status icon
          to move the issue forward.
        </p>
      </div>
      <div style={{ marginTop: 16, borderTop: "1px solid var(--line-t)" }}>
        <div className={s.listToolbar}>
          <div className={s.segmented} role="group" aria-label="View">
            {(["all", "active", "backlog"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={s.segment}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v === "all"
                  ? "All issues"
                  : v === "active"
                    ? "Active"
                    : "Backlog"}
                <span className={s.count}>{counts[v]}</span>
              </button>
            ))}
          </div>
          <div className={s.searchWrap} style={{ maxWidth: 240 }}>
            <label htmlFor={searchId} className={s.srOnly}>
              Filter issues
            </label>
            <SearchIcon />
            <input
              id={searchId}
              className={s.input}
              placeholder="Filter"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {groups.map((g) => (
          <div key={g.status}>
            <div className={s.groupHead}>
              <StatusIcon status={g.status} />
              <span>{STATUS_LABEL[g.status]}</span>
              <span>{g.items.length}</span>
            </div>
            <ul className={s.issueList}>
              {g.items.map((i) => (
                <li key={i.id} className={s.issue}>
                  <span title={PRIORITY_LABEL[i.priority]}>
                    <PriorityIcon priority={i.priority} />
                  </span>
                  <span className={s.issueId}>{i.id}</span>
                  <button
                    type="button"
                    className={s.iconButton}
                    onClick={() => advance(i.id)}
                    aria-label={`${i.id} is ${STATUS_LABEL[i.status]}. Move to next status`}
                  >
                    <StatusIcon status={i.status} />
                  </button>
                  <span className={s.issueTitle}>{i.title}</span>
                  <span className={s.issueMeta}>
                    <LabelChip label={i.label} />
                    <Avatar person={i.assignee} />
                    <span className={s.issueDate}>{i.date}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {groups.length === 0 && (
          <div className={s.empty}>
            No issues match “{query}” in this view.
            <button
              type="button"
              className={cx(s.btn, s.btnSecondary, s.btnSm)}
              onClick={() => setQuery("")}
            >
              Clear filter
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Board() {
  const columns: Status[] = ["todo", "progress", "done"];
  return (
    <Specimen
      title="Board cards"
      note="Level 2 cards with a half-pixel edge and the lift shadow, on the level 1 panel."
      wide
    >
      <div className={s.board}>
        {columns.map((col) => {
          const items = ISSUES.filter((i) => i.status === col);
          return (
            <div key={col} className={s.column}>
              <div className={s.columnHead}>
                <StatusIcon status={col} />
                {STATUS_LABEL[col]}
                <span style={{ color: "var(--fg-4)", fontWeight: 400 }}>
                  {items.length}
                </span>
              </div>
              {items.map((i) => (
                <article key={i.id} className={s.card}>
                  <div className={s.cardTop}>
                    {i.id}
                    <Avatar person={i.assignee} />
                  </div>
                  <div className={s.cardTitle}>
                    <StatusIcon status={i.status} />
                    {i.title}
                  </div>
                  <div className={s.cardFoot}>
                    <span className={s.chip}>
                      <PriorityIcon priority={i.priority} />
                      {PRIORITY_LABEL[i.priority]}
                    </span>
                    <LabelChip label={i.label} />
                  </div>
                </article>
              ))}
            </div>
          );
        })}
      </div>
    </Specimen>
  );
}

function CommandIcon({ name }: { name: (typeof COMMANDS)[number]["icon"] }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "var(--fg-3)",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "plus":
      return (
        <svg {...common}>
          <path d="M8 3v10M3 8h10" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="8" cy="5.5" r="2.5" />
          <path d="M3 13.5c.8-2.4 2.7-3.5 5-3.5s4.2 1.1 5 3.5" />
        </svg>
      );
    case "status":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.5" />
          <path
            d="M8 4.5a3.5 3.5 0 0 1 0 7Z"
            fill="var(--fg-3)"
            stroke="none"
          />
        </svg>
      );
    case "priority":
      return (
        <svg {...common}>
          <path d="M3.5 12.5v-2M8 12.5v-5M12.5 12.5v-8" />
        </svg>
      );
    case "label":
      return (
        <svg {...common}>
          <path d="M2.5 8.2V3.5a1 1 0 0 1 1-1h4.7l5.3 5.3-5.7 5.7Z" />
          <circle cx="5.5" cy="5.5" r="0.8" fill="var(--fg-3)" />
        </svg>
      );
    case "link":
      return (
        <svg {...common}>
          <path d="M6.5 9.5 9.5 6.5M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1" />
        </svg>
      );
  }
}

function Mark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect width="18" height="18" rx="5" fill="var(--fill-2)" />
      <path
        d="M5 5v8h8"
        fill="none"
        stroke="var(--fg-1)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
