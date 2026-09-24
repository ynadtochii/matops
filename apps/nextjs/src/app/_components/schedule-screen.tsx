"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";

import { isBjjAcademy } from "@matops/domain";

import { Curriculum } from "./curriculum";
import { useEntity } from "./entity";
import { PageHeader } from "./page-header";
import { RESOLVE } from "./primitives";
import { Schedule } from "./schedule";
import { Tabs } from "./tabs";
import { Templates } from "./templates";

type ScheduleTab = "week" | "templates" | "curriculum";

const isScheduleTab = (v: string | null): v is ScheduleTab =>
  v === "week" || v === "templates" || v === "curriculum";

/**
 * Schedule screen (IA ticket 02) — the week of concrete classes and the
 * recurring templates and the curriculum plan, grouped under one nav item as
 * three tabs (This week | Templates | Curriculum), per the locked IA.
 *
 * A general space runs the first two tabs and not the third: a curriculum is a
 * teaching plan, and the router refuses it there anyway (ADR 126).
 */
export function ScheduleScreen() {
  const academy = useEntity();
  const bjj = isBjjAcademy(academy.type);
  const curriculum = bjj && academy.curriculumEnabled;
  // The tab is in the URL like every other tabbed owner screen, so a link to
  // Templates or Curriculum lands on it.
  const tabParam = useSearchParams().get("tab");
  const [tab, setTab] = useState<ScheduleTab>(
    isScheduleTab(tabParam) ? tabParam : "week",
  );
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  const onOpened = useCallback(() => setOpenTemplateId(null), []);
  const showCurriculum = curriculum && tab === "curriculum";
  return (
    <>
      <PageHeader title="Schedule" />
      <Tabs
        label="Schedule view"
        value={tab}
        onChange={setTab}
        tabs={
          curriculum
            ? [
                { id: "week", label: "This week" },
                { id: "templates", label: "Templates" },
                { id: "curriculum", label: "Curriculum" },
              ]
            : [
                { id: "week", label: "This week" },
                { id: "templates", label: "Templates" },
              ]
        }
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
        ) : showCurriculum ? (
          <Curriculum />
        ) : (
          <Templates openTemplateId={openTemplateId} onOpened={onOpened} />
        )}
      </div>
    </>
  );
}
