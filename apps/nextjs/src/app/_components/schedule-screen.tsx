"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PageHeader } from "./page-header";
import { RESOLVE } from "./primitives";
import { Schedule } from "./schedule";
import { Tabs } from "./tabs";
import { Templates } from "./templates";

type ScheduleTab = "week" | "templates";

const isScheduleTab = (v: string | null): v is ScheduleTab =>
  v === "week" || v === "templates";

/**
 * Schedule screen (IA ticket 02) — the week of concrete classes and the
 * recurring templates, grouped under one nav item as two tabs
 * (This week | Templates), per the locked IA.
 */
export function ScheduleScreen() {
  // The tab is in the URL like every other tabbed owner screen, so a link to
  // Templates lands on it.
  const tabParam = useSearchParams().get("tab");
  const [tab, setTab] = useState<ScheduleTab>(
    isScheduleTab(tabParam) ? tabParam : "week",
  );
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  const onOpened = useCallback(() => setOpenTemplateId(null), []);
  return (
    <>
      <PageHeader title="Schedule" />
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
      <div key={tab} className={RESOLVE}>
        {tab === "week" ? (
          <Schedule
            onOpenTemplate={(id) => {
              setOpenTemplateId(id);
              setTab("templates");
            }}
          />
        ) : (
          <Templates openTemplateId={openTemplateId} onOpened={onOpened} />
        )}
      </div>
    </>
  );
}
