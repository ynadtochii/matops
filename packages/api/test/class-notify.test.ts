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
const COACH = "u_notify_coach";
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
        { userId: COACH, role: "instructor", status: "active" },
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
  await h.pg.exec(`
    INSERT INTO "drop_in" (id, academy_id, first_name, last_name, phone, email, consent)
    VALUES ('bbbbbbbb-0000-4000-8000-000000000401', '${ACAD}', 'Ana', 'Silva', '+351912345678', 'visitor@example.com', true);
    INSERT INTO "drop_in_visit" (academy_id, drop_in_id, class_id, booking_status)
    VALUES ('${ACAD}', 'bbbbbbbb-0000-4000-8000-000000000401', '${TO_CANCEL}', 'booked');
  `);
});

afterAll(() => h.close());

describe("the booked students hear about a class", () => {
  it("tells them when it is cancelled", async () => {
    await h.as(OWNER, ACAD).class.cancel({ id: TO_CANCEL });
    expect(await kindsFor(STUDENT)).toContain("class_cancelled");
    const recipients = await h.pg.query<{ email: string }>(
      `SELECT email FROM "notification_recipient" ORDER BY email`,
    );
    expect(recipients.rows.map((row) => row.email)).toEqual([
      `${STUDENT}@test.local`,
      "visitor@example.com",
    ]);
  });

  it("tells them when the coach changes", async () => {
    await h
      .as(OWNER, ACAD)
      .class.setInstructor({ id: TO_MOVE, instructorId: COACH });
    expect(await kindsFor(STUDENT)).toContain("class_changed");
  });
});
