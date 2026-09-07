"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@matops/ui";

import { CountBadge } from "./primitives";

export function Tabs<T extends string>({
  label,
  value,
  onChange,
  tabs,
  className,
}: {
  label: string;
  value: T;
  onChange: (next: T) => void;
  tabs: { id: T; label: string; count?: number }[];
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [rail, setRail] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[data-active="true"]');
    if (!list || !active) return;
    const measure = () =>
      setRail({ left: active.offsetLeft, width: active.offsetWidth });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    observer.observe(active);
    return () => observer.disconnect();
  }, [value, tabs]);

  return (
    <div
      ref={listRef}
      role="group"
      aria-label={label}
      className={cn(
        "border-border relative flex [scrollbar-width:none] gap-1 overflow-x-auto border-b [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            data-active={active}
            aria-pressed={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-2 px-3 py-2 text-sm whitespace-nowrap transition-colors sm:min-h-0",
              active
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <CountBadge>{t.count}</CountBadge>
            )}
          </button>
        );
      })}
      {/* One rail that travels, rather than a mark that blinks out and in: it
          carries the eye from the old tab to the new one. A 1px bar scaled on
          the x axis, so the move is transform-only. */}
      <span
        aria-hidden
        className="bg-brand absolute bottom-0 left-0 h-0.5 w-px origin-left transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{
          transform: `translateX(${rail.left}px) scaleX(${rail.width})`,
        }}
      />
    </div>
  );
}
