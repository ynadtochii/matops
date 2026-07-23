"use client";

import { useState } from "react";

import { PageHeader } from "./page-header";
import { Schedule } from "./schedule";
import { Templates } from "./templates";

/**
 * Schedule screen (IA ticket 02) — the week of concrete classes and the
 * recurring templates, grouped under one nav item as two tabs (This week |
 * Templates), per the locked IA.
 */
export function ScheduleScreen() {
  const [tab, setTab] = useState<"week" | "templates">("week");
  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle="Run the week — concrete classes and the recurring engine behind them."
      />
      <div
        role="tablist"
        aria-label="Schedule view"
        className="border-border mb-6 flex gap-1 border-b"
      >
        <TabButton
          id="tab-week"
          active={tab === "week"}
          onClick={() => setTab("week")}
        >
          This week
        </TabButton>
        <TabButton
          id="tab-templates"
          active={tab === "templates"}
          onClick={() => setTab("templates")}
        >
          Templates
        </TabButton>
      </div>
      <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "week" ? <Schedule /> : <Templates />}
      </div>
    </>
  );
}

function TabButton({
  id,
  active,
  onClick,
  children,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative -mb-px px-3 py-2 text-sm transition-colors ${
        active
          ? "text-foreground font-medium"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      {active && <span className="bg-brand absolute inset-x-0 -bottom-px h-0.5" />}
    </button>
  );
}
