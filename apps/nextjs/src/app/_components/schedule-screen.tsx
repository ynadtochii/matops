"use client";

import { useState } from "react";

import { Curriculum } from "./curriculum";
import { PageHeader } from "./page-header";
import { Tabs } from "./primitives";
import { Schedule } from "./schedule";
import { Templates } from "./templates";

/**
 * Schedule screen (IA ticket 02) — the week of concrete classes and the
 * recurring templates and the curriculum plan, grouped under one nav item as
 * three tabs (This week | Templates | Curriculum), per the locked IA.
 */
export function ScheduleScreen() {
  const [tab, setTab] = useState<"week" | "templates" | "curriculum">("week");
  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle="Run the week — concrete classes and the recurring engine behind them."
      />
      <Tabs
        label="Schedule view"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "week", label: "This week" },
          { id: "templates", label: "Templates" },
          { id: "curriculum", label: "Curriculum" },
        ]}
        className="mb-6"
      />
      <div>
        {tab === "week" ? (
          <Schedule />
        ) : tab === "templates" ? (
          <Templates />
        ) : (
          <Curriculum />
        )}
      </div>
    </>
  );
}
