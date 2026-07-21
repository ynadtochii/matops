"use client";

import { AcademySwitcher } from "./academy-switcher";
import { Attendance } from "./attendance";
import { Invites } from "./invites";
import { Roster } from "./roster";
import { Schedule } from "./schedule";
import { Settings } from "./settings";
import { SignOutButton } from "./sign-out";
import { Templates } from "./templates";

interface Current {
  academyId: string;
  name: string;
  role: string;
  status: string;
}

interface Academy {
  academyId: string;
  name: string;
}

/**
 * The owner/instructor home. Owners get the roster + invite links; a not-yet-
 * approved instructor sees a pending banner (schedule tools arrive in Phase 2).
 */
export function Dashboard({
  current,
  academies,
}: {
  current: Current;
  academies: Academy[];
}) {
  const isOwner = current.role === "owner" && current.status === "active";
  const isStaff =
    current.status === "active" &&
    (current.role === "owner" || current.role === "instructor");
  const isPending = current.status === "pending";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold">{current.name}</h1>
          <span className="text-muted-foreground text-sm capitalize">
            {isPending ? "pending approval" : current.role}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <AcademySwitcher academies={academies} activeId={current.academyId} />
          <SignOutButton />
        </div>
      </header>

      {isPending && (
        <div className="border-primary/30 bg-primary/10 rounded-lg border p-4 text-sm">
          You&apos;re pending approval. Your gym will confirm you soon — you can
          browse in the meantime.
        </div>
      )}

      {isStaff && <Schedule />}
      {isStaff && <Attendance />}
      {isStaff && <Templates />}
      {isOwner && (
        <>
          <Invites />
          <Roster />
          <Settings academyId={current.academyId} />
        </>
      )}
      {!isStaff && !isPending && (
        <p className="text-muted-foreground text-sm">
          Your schedule and booking tools live on the mobile app.
        </p>
      )}
    </div>
  );
}
