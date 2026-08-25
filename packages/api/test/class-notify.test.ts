import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import {
  harness,
  seedAcademies,
  seedClasses,
  seedParticipations,
} from "./helpers";

const ACAD = "acad_notify";
const OWNER = "u_notify_owner";
const STUDENT = "u_notify_student";
const TO_CANCEL = "aaaaaaaa-0000-4000-8000-000000000401";
const TO_MOVE = "aaaaaaaa-0000-4000-8000-000000000402";

let h: Harness;

const kindsFor = async (studentId: string): Promise<string[]> => {
  const res = await h.pg.query<{ kind: string }>(
    `SELECT kind FROM "notification" WHERE user_id = $1 ORDER BY created_at`,
    [studentId],
  );
  return res.rows.map((r) => r.kind);
};

beforeAll(async () => {
  h = await harness();
  await seedAcademies(h.pg, [
    {
      id: ACAD,
      code: "700050",
      members: [
        { userId: OWNER, role: "owner", status: "active" },
        { userId: STUDENT, role: "student", status: "active" },
      ],
    },
  ]);
  await seedClasses(h.pg, [
    {
      id: TO_CANCEL,
      academyId: ACAD,
      instructorId: OWNER,
      startsInMinutes: 240,
    },
    { id: TO_MOVE, academyId: ACAD, instructorId: OWNER, startsInMinutes: 300 },
  ]);
  await seedParticipations(h.pg, [
    { classId: TO_CANCEL, academyId: ACAD, studentId: STUDENT },
    { classId: TO_MOVE, academyId: ACAD, studentId: STUDENT },
  ]);
});

afterAll(() => h.close());

describe("the booked students hear about a class", () => {
  it("tells them when it is cancelled", async () => {
    await h.as(OWNER, ACAD).class.cancel({ id: TO_CANCEL });
    expect(await kindsFor(STUDENT)).toContain("class_cancelled");
  });

  it("tells them when it moves", async () => {
    await h.as(OWNER, ACAD).class.update({
      id: TO_MOVE,
      title: "Gi Fundamentals",
      instructorId: OWNER,
      durationMinutes: 60,
      capacity: 20,
      date: "2026-12-01",
      startsAtMinutes: 1140,
      timeZone: "Europe/Lisbon",
    });
    expect(await kindsFor(STUDENT)).toContain("class_changed");
  });
});
