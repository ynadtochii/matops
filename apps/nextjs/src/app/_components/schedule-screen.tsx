"use client";

import { useState } from "react";

import { PageHeader } from "./page-header";
import { Tabs } from "./primitives";
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
      <Tabs
        label="Schedule view"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "week", label: "This week" },
          { id: "templates", label: "Templates" },
        ]}
        className="mb-6"
      />
      <div>{tab === "week" ? <Schedule /> : <Templates />}</div>
    </>
  );
}
