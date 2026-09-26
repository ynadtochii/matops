"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { Person, Status } from "./primitives";
import s from "./linear-ds.module.css";
import {
  Avatar,
  cx,
  ISSUES,
  Kbd,
  LabelChip,
  PriorityIcon,
  Specimen,
  STATUS_LABEL,
  StatusIcon,
} from "./primitives";

export function MoreComponents() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const nextId = useRef(0);
  const dismiss = useCallback(
    (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    [],
  );

  function notify(toast: Omit<Toast, "id">) {
    nextId.current += 1;
    const id = nextId.current;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }

  return (
    <>
      <div className={s.gallery}>
        <TabsSpecimen />
        <MenuAndTooltipSpecimen />
        <DialogSpecimen notify={notify} />
        <ToastSpecimen notify={notify} />
        <SelectionSpecimen />
        <RadioSpecimen />
        <SidebarSpecimen />
        <ProgressSpecimen />
        <CalloutSpecimen />
        <SkeletonSpecimen />
        <ActivitySpecimen />
      </div>
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </>
  );
}

function TabsSpecimen() {
  const tabs = [
    {
      id: "overview",
      label: "Overview",
      body: "Fundamentals runs Tuesday and Thursday at 18:00. This block covers guard retention for four weeks.",
    },
    {
      id: "activity",
      label: "Activity",
      body: "Rita moved the block to start on Monday. Two students booked the next class.",
    },
    {
      id: "issues",
      label: "Issues",
      body: "Three open issues mention this class. One is urgent.",
    },
  ];
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();

  function onKeyDown(e: KeyboardEvent) {
    const last = tabs.length - 1;
    const next =
      e.key === "ArrowRight"
        ? active === last
          ? 0
          : active + 1
        : e.key === "ArrowLeft"
          ? active === 0
            ? last
            : active - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  }

  const current = tabs[active] ?? tabs[0];

  return (
    <Specimen
      title="Tabs"
      note="Text tabs with a 2px underline on the current one. Arrow keys move between them."
      stack
    >
      <div
        className={s.tablist}
        role="tablist"
        aria-label="Class"
        onKeyDown={onKeyDown}
      >
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-${t.id}`}
            aria-selected={i === active}
            aria-controls={`${baseId}-panel`}
            tabIndex={i === active ? 0 : -1}
            className={s.tab}
            onClick={() => setActive(i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-${current?.id}`}
        className={s.tabPanel}
        tabIndex={0}
      >
        <p>{current?.body}</p>
      </div>
    </Specimen>
  );
}

const MENU_STATUSES: Status[] = [
  "backlog",
  "todo",
  "progress",
  "review",
  "done",
  "canceled",
];

function MenuAndTooltipSpecimen() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("progress");
  const [tip, setTip] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const tipId = useId();

  useEffect(() => {
    if (open) itemRefs.current[MENU_STATUSES.indexOf(status)]?.focus();
  }, [open, status]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onMenuKeyDown(e: KeyboardEvent) {
    const items = itemRefs.current;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <Specimen
      title="Menu and tooltip"
      note="Both float on level 3 with the float shadow. Menus open on the current value and close with Escape."
    >
      <div
        className={s.popoverWrap}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          className={cx(s.btn, s.btnSecondary)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((o) => !o)}
        >
          <StatusIcon status={status} />
          {STATUS_LABEL[status]}
        </button>
        {open && (
          <div
            id={menuId}
            role="menu"
            aria-label="Change status"
            className={s.popover}
            onKeyDown={onMenuKeyDown}
          >
            <div className={s.popoverLabel} aria-hidden>
              Change status
            </div>
            {MENU_STATUSES.map((st, i) => (
              <button
                key={st}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={st === status}
                tabIndex={-1}
                className={s.popoverItem}
                onClick={() => {
                  setStatus(st);
                  close();
                }}
              >
                <StatusIcon status={st} />
                <span>{STATUS_LABEL[st]}</span>
                {st === status ? <CheckIcon /> : <Kbd>{i + 1}</Kbd>}
              </button>
            ))}
          </div>
        )}
      </div>

      <span
        className={s.tooltipWrap}
        onMouseEnter={() => setTip(true)}
        onMouseLeave={() => setTip(false)}
        onFocus={() => setTip(true)}
        onBlur={() => setTip(false)}
        onKeyDown={(e) => e.key === "Escape" && setTip(false)}
      >
        <button
          type="button"
          className={cx(s.btn, s.btnGhost)}
          aria-describedby={tip ? tipId : undefined}
        >
          <Icon name="bell" />
          Subscribe
        </button>
        {tip && (
          <span id={tipId} role="tooltip" className={s.tooltip}>
            Get notified about changes <Kbd>⇧</Kbd>
            <Kbd>S</Kbd>
          </span>
        )}
      </span>
    </Specimen>
  );
}

function DialogSpecimen({ notify }: { notify: Notify }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState(false);
  const [more, setMore] = useState(false);
  const titleId = useId();
  const errorId = useId();

  function submit() {
    if (!title.trim()) {
      setError(true);
      document.getElementById(titleId)?.focus();
      return;
    }
    notify({ title: "Issue created", detail: `MAT-240 ${title.trim()}` });
    setTitle("");
    setError(false);
    if (!more) ref.current?.close();
  }

  return (
    <Specimen
      title="Dialog"
      note="A native modal dialog. Focus stays inside, Escape closes it, and the title is the first field."
    >
      <button
        type="button"
        className={cx(s.btn, s.btnPrimary)}
        onClick={() => ref.current?.showModal()}
      >
        <Icon name="plus" />
        New issue
      </button>
      <span className={s.hint}>
        Opens a modal. Submit with <Kbd>⌘</Kbd>
        <Kbd>↵</Kbd>
      </span>

      <dialog
        ref={ref}
        className={s.dialog}
        aria-labelledby={`${titleId}-label`}
        onClose={() => setError(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className={s.dialogHead}>
            <span className={s.chip}>MAT</span>
            <span id={`${titleId}-label`}>New issue</span>
            <button
              type="button"
              className={s.iconButton}
              aria-label="Close"
              onClick={() => ref.current?.close()}
            >
              <Icon name="close" />
            </button>
          </div>
          <label htmlFor={titleId} className={s.srOnly}>
            Issue title
          </label>
          <input
            id={titleId}
            className={s.dialogTitleInput}
            placeholder="Issue title"
            value={title}
            aria-invalid={error}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(false);
            }}
            autoFocus
          />
          {error && (
            <p id={errorId} className={s.error} style={{ padding: "0 16px" }}>
              Give the issue a title.
            </p>
          )}
          <textarea
            className={s.dialogBodyInput}
            placeholder="Add a description"
            aria-label="Description"
          />
          <div className={s.dialogProps}>
            <span className={s.chip}>
              <StatusIcon status="todo" />
              Todo
            </span>
            <span className={s.chip}>
              <PriorityIcon priority="none" />
              Priority
            </span>
            <span className={s.chip}>
              <Avatar person="AK" />
              Assignee
            </span>
            <LabelChip label="Feature" />
          </div>
          <div className={s.dialogFoot}>
            <label className={s.switchRow}>
              <button
                type="button"
                role="switch"
                aria-checked={more}
                className={s.switch}
                onClick={() => setMore((m) => !m)}
              />
              Create more
            </label>
            <button type="submit" className={cx(s.btn, s.btnBrand)}>
              Create issue
            </button>
          </div>
        </form>
      </dialog>
    </Specimen>
  );
}

interface Toast {
  id: number;
  title: string;
  detail?: string;
  undo?: boolean;
}

type Notify = (toast: Omit<Toast, "id">) => void;

function ToastSpecimen({ notify }: { notify: Notify }) {
  return (
    <Specimen
      title="Toast"
      note="Bottom right, level 3, gone after 5 seconds. It says what happened and offers the way back."
    >
      <button
        type="button"
        className={cx(s.btn, s.btnSecondary)}
        onClick={() =>
          notify({
            title: "Moved to Done",
            detail: "MAT-212 Book a lead onto a future class",
            undo: true,
          })
        }
      >
        Mark as done
      </button>
      <button
        type="button"
        className={cx(s.btn, s.btnGhost)}
        onClick={() =>
          notify({ title: "Link copied", detail: "linear.app/matops/MAT-212" })
        }
      >
        <Icon name="link" />
        Copy link
      </button>
    </Specimen>
  );
}

function ToastRegion({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <ol className={s.toastRegion} aria-live="polite" aria-label="Notifications">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </ol>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  const [undone, setUndone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [onDismiss, toast.id]);

  return (
    <li className={s.toast}>
      <StatusIcon status={undone ? "progress" : "done"} />
      <span>
        {undone ? "Moved back to In progress" : toast.title}
        {toast.detail && <small>{toast.detail}</small>}
      </span>
      {toast.undo && !undone && (
        <button
          type="button"
          className={cx(s.btn, s.btnSecondary, s.btnSm)}
          onClick={() => setUndone(true)}
        >
          Undo
        </button>
      )}
      <button
        type="button"
        className={s.iconButton}
        aria-label="Dismiss"
        onClick={() => onDismiss(toast.id)}
      >
        <Icon name="close" />
      </button>
    </li>
  );
}

function SelectionSpecimen() {
  const rows = ISSUES.slice(0, 4);
  const [picked, setPicked] = useState<string[]>([rows[1]?.id ?? ""]);
  const allRef = useRef<HTMLInputElement>(null);
  const all = picked.length === rows.length;
  const some = picked.length > 0 && !all;

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = some;
  }, [some]);

  function toggle(id: string) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  return (
    <Specimen
      title="Checkbox and bulk actions"
      note="Selected rows take the accent tint. A floating bar appears with actions for the selection."
      stack
    >
      <ul className={s.selectList}>
        <li>
          <label className={cx(s.selectRow, s.selectHead)}>
            <input
              ref={allRef}
              type="checkbox"
              className={s.check}
              checked={all}
              onChange={() => setPicked(all ? [] : rows.map((r) => r.id))}
            />
            Select all
          </label>
        </li>
        {rows.map((r) => (
          <li key={r.id}>
            <label className={s.selectRow}>
              <input
                type="checkbox"
                className={s.check}
                checked={picked.includes(r.id)}
                onChange={() => toggle(r.id)}
              />
              <StatusIcon status={r.status} />
              <span className={s.issueTitle}>{r.title}</span>
            </label>
          </li>
        ))}
      </ul>
      {picked.length > 0 && (
        <div className={s.bulkBar} role="toolbar" aria-label="Selection">
          <span>{picked.length} selected</span>
          <button type="button" className={cx(s.btn, s.btnGhost, s.btnSm)}>
            Status
          </button>
          <button type="button" className={cx(s.btn, s.btnGhost, s.btnSm)}>
            Assign
          </button>
          <button
            type="button"
            className={s.iconButton}
            aria-label="Clear selection"
            onClick={() => setPicked([])}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
    </Specimen>
  );
}

function RadioSpecimen() {
  const options = [
    { id: "exp", name: "Exponential", detail: "1, 2, 4, 8, 16" },
    { id: "fib", name: "Fibonacci", detail: "1, 2, 3, 5, 8" },
    { id: "lin", name: "Linear", detail: "1, 2, 3, 4, 5" },
  ];
  const [value, setValue] = useState("fib");
  const name = useId();

  return (
    <Specimen
      title="Radio cards"
      note="For a choice between a few settings, each with a short explanation."
      stack
    >
      <fieldset className={s.radioCards}>
        <legend>Estimate scale</legend>
        {options.map((o) => (
          <label key={o.id} className={s.radioCard}>
            <input
              type="radio"
              name={name}
              className={s.radio}
              value={o.id}
              checked={value === o.id}
              onChange={() => setValue(o.id)}
            />
            <span>
              <b>{o.name}</b>
              <span>{o.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </Specimen>
  );
}

const NAV = [
  { id: "inbox", icon: "inbox", label: "Inbox", count: 3 },
  { id: "mine", icon: "user", label: "My issues", count: 7 },
  { id: "views", icon: "layers", label: "Views" },
] as const;

const TEAM_NAV = [
  { id: "issues", icon: "circle", label: "Issues" },
  { id: "cycles", icon: "cycle", label: "Cycles" },
  { id: "projects", icon: "box", label: "Projects" },
] as const;

function SidebarSpecimen() {
  const [current, setCurrent] = useState("issues");
  const all = [...NAV, ...TEAM_NAV];
  const page = all.find((n) => n.id === current);

  const item = (n: (typeof all)[number]) => (
    <button
      key={n.id}
      type="button"
      className={s.navItem}
      aria-current={current === n.id ? "page" : undefined}
      onClick={() => setCurrent(n.id)}
    >
      <Icon name={n.icon} />
      <span>{n.label}</span>
      {"count" in n && <span className={s.navCount}>{n.count}</span>}
    </button>
  );

  return (
    <Specimen
      title="Sidebar and breadcrumb"
      note="Level 1 sidebar with 28px items. The current page gets the strongest fill. Teams fold away."
      wide
    >
      <div className={s.sidebarFrame}>
        <nav className={s.sidebar} aria-label="Workspace">
          <div className={s.workspace}>
            <span className={s.workspaceMark}>M</span>
            matops
          </div>
          {NAV.map(item)}
          <details className={s.navGroup} open>
            <summary>
              <Icon name="chevron" size={12} />
              Alma beta
            </summary>
            {TEAM_NAV.map(item)}
          </details>
        </nav>
        <div className={s.sidebarMain}>
          <nav className={s.crumbs} aria-label="Breadcrumb">
            <ol>
              <li>
                <a href="#components">Alma beta</a>
                <ChevronSep />
              </li>
              {TEAM_NAV.some((t) => t.id === current) && (
                <li>
                  <a href="#components">Curriculum</a>
                  <ChevronSep />
                </li>
              )}
              <li>
                <span aria-current="page">{page?.label}</span>
              </li>
            </ol>
          </nav>
          <p style={{ margin: 0 }}>
            The content area stays on level 0, one step darker than the sidebar.
          </p>
        </div>
      </div>
    </Specimen>
  );
}

type Health = "On track" | "At risk" | "Off track";

const PROJECTS: {
  name: string;
  health: Health;
  lead: Person;
  target: string;
  progress: number;
}[] = [
  {
    name: "Public booking",
    health: "On track",
    lead: "RM",
    target: "2026-10-15",
    progress: 72,
  },
  {
    name: "Curriculum wave 2",
    health: "At risk",
    lead: "LT",
    target: "2026-10-01",
    progress: 38,
  },
  {
    name: "Mobile device pass",
    health: "Off track",
    lead: "JS",
    target: "2026-09-30",
    progress: 12,
  },
  {
    name: "Launch hardening",
    health: "On track",
    lead: "AK",
    target: "2026-11-20",
    progress: 55,
  },
];

const HEALTH_COLOR: Record<Health, string> = {
  "On track": "var(--green)",
  "At risk": "var(--yellow)",
  "Off track": "var(--red)",
};

type SortKey = "target" | "progress";

function ProgressSpecimen() {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "target",
    dir: 1,
  });
  const rows = [...PROJECTS].sort((a, b) =>
    sort.key === "target"
      ? a.target.localeCompare(b.target) * sort.dir
      : (a.progress - b.progress) * sort.dir,
  );
  const total = Math.round(
    PROJECTS.reduce((sum, p) => sum + p.progress, 0) / PROJECTS.length,
  );

  const header = (key: SortKey, label: string) => (
    <th
      aria-sort={
        sort.key === key
          ? sort.dir === 1
            ? "ascending"
            : "descending"
          : undefined
      }
    >
      <button
        type="button"
        className={s.sortButton}
        onClick={() =>
          setSort((prev) => ({
            key,
            dir: prev.key === key ? (prev.dir === 1 ? -1 : 1) : 1,
          }))
        }
      >
        {label}
        {sort.key === key && (
          <Icon name={sort.dir === 1 ? "up" : "down"} size={12} />
        )}
      </button>
    </th>
  );

  return (
    <Specimen
      title="Progress and projects table"
      note="Rings for one number, bars for a number with context. Health is a colored dot plus a word, never color alone."
      wide
      stack
    >
      <div className={s.progressRow}>
        <span className={s.ring}>
          <ProgressRing value={total} size={28} />
          {total}% across 4 projects
        </span>
        <div className={s.bar}>
          <div
            className={s.barTrack}
            role="progressbar"
            aria-valuenow={9}
            aria-valuemin={0}
            aria-valuemax={14}
            aria-label="Cycle 12"
          >
            <div
              className={s.barFill}
              style={{ width: `${(9 / 14) * 100}%` }}
            />
          </div>
          <div className={s.barMeta}>
            <span>Cycle 12</span>
            <span>9 of 14 issues done</span>
          </div>
        </div>
      </div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Project</th>
              <th>Health</th>
              <th>Lead</th>
              {header("target", "Target date")}
              {header("progress", "Progress")}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td>
                  <span className={s.chip}>
                    <span
                      className={s.dot}
                      style={{ background: HEALTH_COLOR[p.health] }}
                    />
                    {p.health}
                  </span>
                </td>
                <td>
                  <Avatar person={p.lead} />
                </td>
                <td>
                  {new Date(p.target).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </td>
                <td>
                  <span className={s.ring}>
                    <ProgressRing value={p.progress} size={16} />
                    {p.progress}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Specimen>
  );
}

function ProgressRing({ value, size }: { value: number; size: number }) {
  const stroke = size > 20 ? 3 : 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--fill-2)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--brand)"
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value / 100)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function CalloutSpecimen() {
  const [shown, setShown] = useState(true);
  return (
    <Specimen
      title="Callouts"
      note="A thin tint of the status color, an icon, and a short fix. Used inline, never as a page-wide banner."
      stack
    >
      {shown ? (
        <div className={cx(s.callout, s.calloutInfo)} role="status">
          <Icon name="info" color="var(--accent)" />
          <div>
            <b>Public booking is off</b>
            Turn it on in Settings to share the booking link with visitors.
          </div>
          <button
            type="button"
            className={s.iconButton}
            aria-label="Dismiss"
            onClick={() => setShown(false)}
          >
            <Icon name="close" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={cx(s.btn, s.btnGhost, s.btnSm)}
          onClick={() => setShown(true)}
        >
          Show the info callout again
        </button>
      )}
      <div className={cx(s.callout, s.calloutWarn)}>
        <Icon name="warn" color="var(--yellow)" />
        <div>
          <b>3 students owe September dues</b>
          Reminders go out on the 5th. You can send one now from Payments.
        </div>
      </div>
      <div className={cx(s.callout, s.calloutError)} role="alert">
        <Icon name="warn" color="var(--red)" />
        <div>
          <b>The schedule did not save</b>
          The class overlaps Fundamentals on Tuesday at 18:00. Pick another
          time.
        </div>
      </div>
    </Specimen>
  );
}

function SkeletonSpecimen() {
  return (
    <Specimen
      title="Loading skeleton"
      note="Grey blocks in the shape of the content that is coming. They pulse slowly and stop for reduced motion."
      stack
    >
      <div aria-busy="true" aria-label="Loading issues" role="status">
        {[62, 48, 71, 40].map((w) => (
          <div key={w} className={s.skeletonRow}>
            <span
              className={s.skeleton}
              style={{ width: 14, height: 14, borderRadius: "50%" }}
            />
            <span className={s.skeleton} style={{ width: 52, height: 10 }} />
            <span
              className={s.skeleton}
              style={{ width: `${w}%`, height: 10 }}
            />
          </div>
        ))}
      </div>
    </Specimen>
  );
}

interface Entry {
  id: number;
  kind: "event" | "comment";
  who: Person;
  name: string;
  text: string;
  when: string;
}

function ActivitySpecimen() {
  const [entries, setEntries] = useState<Entry[]>([
    {
      id: 1,
      kind: "event",
      who: "RM",
      name: "Rita",
      text: "created the issue",
      when: "2 days ago",
    },
    {
      id: 2,
      kind: "event",
      who: "RM",
      name: "Rita",
      text: "moved from Todo to In progress",
      when: "1 day ago",
    },
    {
      id: 3,
      kind: "comment",
      who: "AK",
      name: "Andre",
      text: "The desk box stops at the markable window. A lead who calls on Monday cannot be put on Wednesday yet.",
      when: "3 hours ago",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(false);
  const inputId = useId();

  function send() {
    if (!draft.trim()) {
      setError(true);
      document.getElementById(inputId)?.focus();
      return;
    }
    setEntries((prev) => [
      ...prev,
      {
        id: Date.now(),
        kind: "comment",
        who: "LT",
        name: "You",
        text: draft.trim(),
        when: "just now",
      },
    ]);
    setDraft("");
  }

  return (
    <Specimen
      title="Activity and comments"
      note="Events are one quiet line. Comments get a level 2 card. The composer grows a border on focus."
      wide
      stack
    >
      <ol className={s.feed}>
        {entries.map((e) =>
          e.kind === "event" ? (
            <li key={e.id} className={s.event}>
              <Avatar person={e.who} />
              <span>
                <b>{e.name}</b> {e.text}
              </span>
              <span className={s.eventTime}>{e.when}</span>
            </li>
          ) : (
            <li key={e.id} className={s.comment}>
              <div className={s.commentHead}>
                <Avatar person={e.who} />
                <b>{e.name}</b>
                <span className={s.eventTime}>{e.when}</span>
              </div>
              <p>{e.text}</p>
            </li>
          ),
        )}
      </ol>
      <form
        className={s.composer}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor={inputId} className={s.srOnly}>
          Comment
        </label>
        <textarea
          id={inputId}
          placeholder="Leave a comment"
          value={draft}
          aria-invalid={error}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className={s.composerFoot}>
          <span className={error ? s.error : undefined} aria-live="polite">
            {error ? "Write something before you send it." : "Markdown works."}
          </span>
          <button type="submit" className={cx(s.btn, s.btnSecondary, s.btnSm)}>
            Comment
          </button>
        </div>
      </form>
    </Specimen>
  );
}

function ChevronSep() {
  return (
    <span className={s.crumbSep} aria-hidden>
      <Icon name="chevron" size={12} />
    </span>
  );
}

function CheckIcon() {
  return <Icon name="check" color="var(--fg-1)" />;
}

const ICONS: Record<string, ReactNode> = {
  plus: <path d="M8 3v10M3 8h10" />,
  close: <path d="m4.5 4.5 7 7m0-7-7 7" />,
  check: <path d="m3.5 8.2 3 3 6-6.4" />,
  chevron: <path d="m6 4 4 4-4 4" />,
  up: <path d="m4.5 9.5 3.5-3.5 3.5 3.5" />,
  down: <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />,
  bell: <path d="M4 11V7.5a4 4 0 0 1 8 0V11l1 1.5H3ZM6.5 14h3" />,
  link: (
    <path d="M6.5 9.5 9.5 6.5M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1" />
  ),
  inbox: <path d="M2.5 9.5h3l1 1.5h3l1-1.5h3M3.5 3.5h9l1 6v3h-11v-3Z" />,
  user: (
    <>
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3 13.5c.8-2.4 2.7-3.5 5-3.5s4.2 1.1 5 3.5" />
    </>
  ),
  layers: (
    <path d="m8 2.5 5.5 3L8 8.5l-5.5-3ZM2.5 8.5 8 11.5l5.5-3M2.5 11 8 14l5.5-3" />
  ),
  circle: <circle cx="8" cy="8" r="5.5" strokeDasharray="2 2" />,
  cycle: <path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v2.5h-2.5" />,
  box: (
    <path d="M2.5 5 8 2.5 13.5 5v6L8 13.5 2.5 11ZM2.5 5 8 7.5 13.5 5M8 7.5v6" />
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.5V11M8 5h.01" />
    </>
  ),
  warn: (
    <>
      <path d="M8 2.5 14 13H2Z" />
      <path d="M8 6.5v3M8 11.3h.01" />
    </>
  ),
};

function Icon({
  name,
  size = 16,
  color = "var(--fg-3)",
}: {
  name: keyof typeof ICONS;
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[name]}
    </svg>
  );
}
