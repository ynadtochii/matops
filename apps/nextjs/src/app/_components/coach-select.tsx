"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { canReassignCoach } from "@matops/domain";
import { Select } from "@matops/ui/select";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { useAcademy } from "./academy";

interface Props {
  classId: string;
  startsAt: string | Date;
  instructorId: string;
  instructorName: string | null;
}

/**
 * The staff options for any coach picker (spec O10, K.1). A class or template
 * can outlive its coach, so the current value is kept selectable even when it is
 * no longer on the roster: opening a form must never silently reassign it.
 *
 * Fetches the list itself. Three pickers can sit on one page and React Query
 * dedupes them into a single request.
 */
export function InstructorOptions({
  value,
  fallbackLabel,
}: {
  value: string;
  fallbackLabel: string;
}) {
  const trpc = useTRPC();
  const options =
    useQuery(trpc.membership.instructors.queryOptions()).data ?? [];
  return (
    <>
      {!options.some((i) => i.userId === value) && (
        <option value={value}>{fallbackLabel}</option>
      )}
      {options.map((i) => (
        <option key={i.userId} value={i.userId}>
          {i.name}
        </option>
      ))}
    </>
  );
}

/**
 * Who is credited for one class (spec O10, K.2) — shown on every class roster,
 * so the O5 attendance screen and the O2 detail modal both get it.
 *
 * Any staff member may set the coach on a class that has not started; once it
 * has, only an owner may change it, because that rewrites reported history. The
 * rule is the shared `canReassignCoach`, the same predicate the server enforces,
 * so the control never offers an action the API will refuse.
 */
export function CoachSelect({
  classId,
  startsAt,
  instructorId,
  instructorName,
}: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const me = useAcademy();

  const allowed = canReassignCoach(me, new Date(startsAt), new Date());

  const setInstructor = useMutation(
    trpc.class.setInstructor.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.class.pathFilter());
        toast.success("Coach updated");
      },
      onError: (err: { message: string }) =>
        toast.error(err.message || "Could not change the coach"),
    }),
  );

  if (!allowed) {
    return (
      <p className="text-muted-foreground text-sm">
        Coach: {instructorName ?? "not set"}
      </p>
    );
  }

  return (
    <div className="flex max-w-xs items-center gap-2">
      <label
        htmlFor={`coach-${classId}`}
        className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase"
      >
        Coach
      </label>
      <Select
        id={`coach-${classId}`}
        value={instructorId}
        className="h-8 min-w-0 flex-1"
        disabled={setInstructor.isPending}
        onChange={(e) =>
          setInstructor.mutate({ id: classId, instructorId: e.target.value })
        }
      >
        <InstructorOptions
          value={instructorId}
          fallbackLabel={instructorName ?? "Unknown"}
        />
      </Select>
    </div>
  );
}
