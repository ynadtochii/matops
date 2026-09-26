"use client";

import type { ReactNode } from "react";

import s from "./linear-ds.module.css";

export type Status =
  "backlog" | "todo" | "progress" | "review" | "done" | "canceled";
export type Priority = "urgent" | "high" | "medium" | "low" | "none";

export const STATUS_LABEL: Record<Status, string> = {
  backlog: "Backlog",
  todo: "Todo",
  progress: "In progress",
  review: "In review",
  done: "Done",
  canceled: "Canceled",
};

export const STATUS_CYCLE: Status[] = [
  "backlog",
  "todo",
  "progress",
  "review",
  "done",
];

export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

export const LABELS = {
  Feature: "var(--accent)",
  Bug: "var(--red)",
  Curriculum: "var(--teal)",
  Security: "var(--orange)",
  Mobile: "var(--blue)",
} as const;

export type Label = keyof typeof LABELS;

export const PEOPLE = {
  AK: "var(--av-ak)",
  RM: "var(--av-rm)",
  JS: "var(--av-js)",
  LT: "var(--av-lt)",
} as const;

export type Person = keyof typeof PEOPLE;

export interface Issue {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
  label: Label;
  assignee: Person;
  date: string;
}

export const ISSUES: Issue[] = [
  {
    id: "MAT-231",
    title: "Rotate AUTH_SECRET on the next deploy",
    status: "todo",
    priority: "urgent",
    label: "Security",
    assignee: "AK",
    date: "Sep 26",
  },
  {
    id: "MAT-212",
    title: "Book a lead onto a future class from the desk",
    status: "progress",
    priority: "high",
    label: "Feature",
    assignee: "RM",
    date: "Sep 24",
  },
  {
    id: "MAT-187",
    title: "Google sign-in does not return to the app",
    status: "review",
    priority: "high",
    label: "Mobile",
    assignee: "JS",
    date: "Sep 22",
  },
  {
    id: "MAT-208",
    title: "Show what was taught on a finished class",
    status: "todo",
    priority: "medium",
    label: "Curriculum",
    assignee: "LT",
    date: "Sep 21",
  },
  {
    id: "MAT-176",
    title: "Rate limit the public booking API at the edge",
    status: "backlog",
    priority: "medium",
    label: "Security",
    assignee: "AK",
    date: "Sep 18",
  },
  {
    id: "MAT-199",
    title: "Copy a curriculum track to a new one",
    status: "backlog",
    priority: "low",
    label: "Curriculum",
    assignee: "LT",
    date: "Sep 15",
  },
  {
    id: "MAT-160",
    title: "Start the curriculum week on Monday",
    status: "done",
    priority: "medium",
    label: "Curriculum",
    assignee: "RM",
    date: "Aug 29",
  },
];

export function cx(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Specimen({
  title,
  note,
  wide,
  stack,
  children,
}: {
  title: string;
  note: string;
  wide?: boolean;
  stack?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cx(s.specimen, wide && s.specimenWide)}>
      <div className={s.specimenHead}>
        <h3>{title}</h3>
        <p>{note}</p>
      </div>
      <div className={cx(s.specimenBody, stack && s.stack)}>{children}</div>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={s.kbd}>{children}</kbd>;
}

export function LabelChip({ label }: { label: Label }) {
  return (
    <span className={s.chip}>
      <span className={s.dot} style={{ background: LABELS[label] }} />
      {label}
    </span>
  );
}

export function Avatar({ person, large }: { person: Person; large?: boolean }) {
  return (
    <span
      className={cx(s.avatar, large && s.avatarLg)}
      style={{ background: PEOPLE[person] }}
      role="img"
      aria-label={`Assigned to ${person}`}
    >
      {person}
    </span>
  );
}

export function StatusIcon({ status }: { status: Status }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 14 14",
    "aria-hidden": true,
  };
  switch (status) {
    case "backlog":
      return (
        <svg {...common}>
          <circle
            cx="7"
            cy="7"
            r="6"
            fill="none"
            stroke="var(--fg-3)"
            strokeWidth="1.5"
            strokeDasharray="1.4 1.74"
          />
        </svg>
      );
    case "todo":
      return (
        <svg {...common}>
          <circle
            cx="7"
            cy="7"
            r="6"
            fill="none"
            stroke="var(--fg-2)"
            strokeWidth="1.5"
          />
        </svg>
      );
    case "progress":
      return (
        <svg {...common}>
          <circle
            cx="7"
            cy="7"
            r="6"
            fill="none"
            stroke="var(--yellow)"
            strokeWidth="1.5"
          />
          <path d="M7 3.5 A3.5 3.5 0 0 1 7 10.5 Z" fill="var(--yellow)" />
        </svg>
      );
    case "review":
      return (
        <svg {...common}>
          <circle
            cx="7"
            cy="7"
            r="6"
            fill="none"
            stroke="var(--green)"
            strokeWidth="1.5"
          />
          <path d="M7 3.5 A3.5 3.5 0 1 1 3.5 7 L7 7 Z" fill="var(--green)" />
        </svg>
      );
    case "done":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="7" fill="var(--brand)" />
          <path
            d="M4.2 7.2 6.1 9 9.8 5.2"
            fill="none"
            stroke="var(--brand-foreground)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "canceled":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="7" fill="var(--fg-4)" />
          <path
            d="M4.9 4.9 9.1 9.1M9.1 4.9 4.9 9.1"
            stroke="var(--bg-0)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

export function PriorityIcon({ priority }: { priority: Priority }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 14 14",
    "aria-hidden": true,
  };
  if (priority === "urgent") {
    return (
      <svg {...common}>
        <rect width="14" height="14" rx="3" fill="var(--orange)" />
        <path
          d="M7 3.5v4.2"
          stroke="var(--bg-0)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="7" cy="10.3" r="1" fill="var(--bg-0)" />
      </svg>
    );
  }
  if (priority === "none") {
    return (
      <svg {...common}>
        {[2.5, 7, 11.5].map((x) => (
          <rect
            key={x}
            x={x - 1}
            y="6.25"
            width="2"
            height="1.5"
            rx="0.5"
            fill="var(--fg-4)"
          />
        ))}
      </svg>
    );
  }
  const filled = priority === "high" ? 3 : priority === "medium" ? 2 : 1;
  return (
    <svg {...common}>
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={1.5 + i * 4.25}
          y={9 - i * 3}
          width="2.5"
          height={3.5 + i * 3}
          rx="0.75"
          fill={i < filled ? "var(--fg-2)" : "var(--fg-4)"}
          opacity={i < filled ? 1 : 0.5}
        />
      ))}
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg
      className={s.searchIcon}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden
    >
      <circle
        cx="6"
        cy="6"
        r="4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="m9.5 9.5 3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
