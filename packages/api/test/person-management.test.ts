import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { user } from "@matops/db/schema";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedAcademies } from "./helpers";

const GYM = "acad_person";
const OTHER = "acad_person_other";
const OWNER = "u_person_owner";
const MANAGER = "u_person_manager";
const COACH = "u_person_coach";
const STUDENT = "u_person_student";
const OTHER_OWNER = "u_person_other_owner";
const LINKED = "u_person_linked";

describe("person management", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: GYM,
        code: "700190",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: MANAGER, role: "manager", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
        ],
      },
      {
        id: OTHER,
        code: "700191",
        members: [{ userId: OTHER_OWNER, role: "owner", status: "active" }],
      },
    ]);
    await h.exec.insert(user).values({
      id: LINKED,
      name: "Linked Account",
      email: "linked@test.local",
      emailVerified: true,
    });
  });

  afterAll(() => h.close());

  it("lets branch staff create an account-independent student", async () => {
    await expect(
      h.as(COACH, GYM).person.previewCreateStudent({ name: "Ana Silva" }),
    ).resolves.toEqual([]);
    const created = await h.as(COACH, GYM).person.createStudent({
      entityId: GYM,
      name: "Ana Silva",
      phone: "+351911111111",
    });
    expect(created.createdPerson).toBe(true);
    expect(created.createdEnrollment).toBe(true);

    const detail = await h.as(MANAGER, GYM).person.get({
      personId: created.personId,
      includeArchived: false,
    });
    expect(detail.account).toBeNull();
    expect(detail.branches).toEqual([
      expect.objectContaining({
        entityId: GYM,
        role: "student",
        status: "active",
      }),
    ]);
    await expect(h.as(MANAGER, GYM).person.directory()).resolves.toContainEqual(
      expect.objectContaining({ id: created.personId, name: "Ana Silva" }),
    );
  });

  it("requires an explicit duplicate decision", async () => {
    const duplicates = await h
      .as(OWNER, GYM)
      .person.previewCreateStudent({ name: "Ana Silva" });
    expect(duplicates).toHaveLength(1);
    const duplicate = duplicates[0];
    if (!duplicate) throw new Error("Expected a duplicate person");
    expect(
      await rejectionCode(
        h
          .as(OWNER, GYM)
          .person.createStudent({ entityId: GYM, name: "Ana Silva" }),
      ),
    ).toBe("CONFLICT");

    const reused = await h.as(OWNER, GYM).person.createStudent({
      entityId: GYM,
      name: "Ana Silva",
      duplicateDecision: {
        kind: "use_existing",
        personId: duplicate.personId,
      },
    });
    expect(reused.createdPerson).toBe(false);
    expect(reused.createdEnrollment).toBe(false);

    const separate = await h.as(OWNER, GYM).person.createStudent({
      entityId: GYM,
      name: "Ana Silva",
      duplicateDecision: {
        kind: "create_separate",
        reviewedPersonIds: duplicates.map((row) => row.personId),
      },
    });
    expect(separate.createdPerson).toBe(true);
  });

  it("links and unlinks a verified account with stale-write checks", async () => {
    const created = await h
      .as(MANAGER, GYM)
      .person.createStudent({ entityId: GYM, name: "Linked Student" });
    const before = await h.as(MANAGER, GYM).person.get({
      personId: created.personId,
      includeArchived: false,
    });
    await expect(
      h.as(MANAGER, GYM).person.accountCandidate({
        personId: created.personId,
        email: "LINKED@test.local",
      }),
    ).resolves.toEqual(
      expect.objectContaining({ userId: LINKED, linkedPersonId: null }),
    );
    expect(
      await rejectionCode(
        h.as(MANAGER, GYM).person.linkAccount({
          personId: created.personId,
          accountUserId: LINKED,
          expectedUpdatedAt: new Date(0).toISOString(),
        }),
      ),
    ).toBe("CONFLICT");
    const linked = await h.as(MANAGER, GYM).person.linkAccount({
      personId: created.personId,
      accountUserId: LINKED,
      expectedUpdatedAt: before.updatedAt.toISOString(),
    });
    await expect(
      h.as(MANAGER, GYM).person.unlinkAccount({
        personId: created.personId,
        expectedAccountUserId: LINKED,
        expectedUpdatedAt: linked.updatedAt.toISOString(),
      }),
    ).resolves.toEqual(expect.objectContaining({ personId: created.personId }));
  });

  it("blocks linking and enrollment while archived", async () => {
    const created = await h
      .as(OWNER, GYM)
      .person.createStudent({ entityId: GYM, name: "Archived Student" });
    await h.as(MANAGER, GYM).person.archive({ personId: created.personId });
    expect(
      await rejectionCode(
        h.as(MANAGER, GYM).person.linkAccount({
          personId: created.personId,
          accountUserId: LINKED,
          expectedUpdatedAt: new Date().toISOString(),
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
    const duplicates = await h
      .as(OWNER, GYM)
      .person.previewCreateStudent({ name: "Archived Student" });
    expect(
      await rejectionCode(
        h.as(OWNER, GYM).person.createStudent({
          entityId: GYM,
          name: "Archived Student",
          duplicateDecision: {
            kind: "use_existing",
            personId: created.personId,
          },
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
    expect(duplicates[0]?.archivedAt).not.toBeNull();
    await expect(
      h.as(MANAGER, GYM).person.restore({ personId: created.personId }),
    ).resolves.toEqual({ changed: true });
  });

  it("keeps management calls away from students and other organizations", async () => {
    expect(
      await rejectionCode(
        h
          .as(STUDENT, GYM)
          .person.createStudent({ entityId: GYM, name: "No Access" }),
      ),
    ).toBe("FORBIDDEN");
    const [known] = await h.as(MANAGER, GYM).person.directory();
    expect(known).toBeDefined();
    if (!known) throw new Error("Expected a person in the directory");
    expect(
      await rejectionCode(
        h.as(OTHER_OWNER, OTHER).person.get({
          personId: known.id,
          includeArchived: true,
        }),
      ),
    ).toBe("NOT_FOUND");
  });
});
