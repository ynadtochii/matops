import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import {
  harness,
  memberId,
  rejectionCode,
  seedClasses,
  seedParticipations,
  storedBookingCount,
} from "./helpers";

const ACAD = "acad_life";
const OTHER = "acad_life_other";

const OWNER = "u_life_owner";
const COOWNER = "u_life_coowner";
const LEAVER = "u_life_leaver";
const FRIEND = "u_life_friend";
const NOMAD = "u_life_nomad";
const OTHER_OWNER = "u_life_other_owner";

const LEAVER_MEMBER = memberId(ACAD, LEAVER);
const FRIEND_MEMBER = memberId(ACAD, FRIEND);
const NOMAD_MEMBER = memberId(ACAD, NOMAD);

const WEEK = {
  from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

const PAST = "33333333-3333-4333-8333-000000000001";
const FUTURE = "33333333-3333-4333-8333-000000000002";
const CANCELLED = "33333333-3333-4333-8333-000000000003";

const countRows = async (h: Harness, sql: string, param: string) => {
  const res = await h.pg.query<{ n: number }>(sql, [param]);
  return res.rows[0]?.n ?? -1;
};

const memberStatus = async (h: Harness, id: string) => {
  const res = await h.pg.query<{ status: string | null }>(
    `SELECT status FROM "entity_membership" WHERE id = $1`,
    [id],
  );
  return res.rows[0]?.status ?? "gone";
};

describe("member archive and permanent erase (docs/issues/84)", () => {
  let h: Harness;
  let planId: string;

  beforeEach(async () => {
    h = await harness([
      {
        id: ACAD,
        code: "700084",
        members: [
          { userId: OWNER, role: "owner", status: "active", name: "Owner" },
          { userId: COOWNER, role: "owner", status: "active", name: "Coowner" },
          { userId: LEAVER, role: "student", status: "active", name: "Leaver" },
          { userId: FRIEND, role: "student", status: "active", name: "Friend" },
          { userId: NOMAD, role: "student", status: "active", name: "Nomad" },
        ],
      },
      {
        id: OTHER,
        code: "700085",
        members: [
          { userId: OTHER_OWNER, role: "owner", status: "active" },
          { userId: NOMAD, role: "student", status: "active", name: "Nomad" },
        ],
      },
    ]);

    await seedClasses(h.pg, [
      {
        id: PAST,
        academyId: ACAD,
        instructorId: OWNER,
        startsInMinutes: -600,
      },
      {
        id: FUTURE,
        academyId: ACAD,
        instructorId: OWNER,
        startsInMinutes: 600,
      },
      {
        id: CANCELLED,
        academyId: ACAD,
        instructorId: OWNER,
        startsInMinutes: 700,
        status: "cancelled",
      },
    ]);
    const plan = await h.as(OWNER, ACAD).payments.createPlan({
      name: "Unlimited",
      priceMinor: 8000,
      currency: "EUR",
      cycle: "monthly",
    });
    planId = plan.id;
  });

  afterEach(() => h.close());

  describe("archive", () => {
    it("cancels only upcoming seats and gives the capacity back", async () => {
      await seedParticipations(h.pg, [
        { classId: PAST, academyId: ACAD, studentId: LEAVER },
        { classId: FUTURE, academyId: ACAD, studentId: LEAVER },
        { classId: FUTURE, academyId: ACAD, studentId: FRIEND },
      ]);
      await h.pg
        .exec(`UPDATE "class" SET booking_count = 2 WHERE id = '${FUTURE}';
                       UPDATE "class" SET booking_count = 1 WHERE id = '${PAST}';`);

      const res = await h
        .as(OWNER, ACAD)
        .membership.archive({ memberId: LEAVER_MEMBER });

      expect(res.seatsFreed).toBe(1);
      expect(await storedBookingCount(h.pg, FUTURE)).toBe(1);
      expect(await storedBookingCount(h.pg, PAST)).toBe(1);

      const past = await h.pg.query<{ booking_status: string }>(
        `SELECT booking_status FROM "class_participation"
          WHERE class_id = $1 AND student_id = $2`,
        [PAST, LEAVER],
      );
      expect(past.rows[0]?.booking_status).toBe("booked");
    });

    it("leaves a cancelled class alone", async () => {
      await seedParticipations(h.pg, [
        { classId: CANCELLED, academyId: ACAD, studentId: LEAVER },
      ]);
      const res = await h
        .as(OWNER, ACAD)
        .membership.archive({ memberId: LEAVER_MEMBER });
      expect(res.seatsFreed).toBe(0);
    });

    it("revokes access", async () => {
      await h.as(OWNER, ACAD).membership.archive({ memberId: LEAVER_MEMBER });
      expect(await rejectionCode(h.as(LEAVER, ACAD).class.mine(WEEK))).toBe(
        "FORBIDDEN",
      );
    });

    it("drops them off the roster but onto the archived tab", async () => {
      await h.as(OWNER, ACAD).membership.archive({ memberId: LEAVER_MEMBER });

      const roster = await h.as(OWNER, ACAD).membership.members();
      expect(roster.map((m) => m.memberId)).not.toContain(LEAVER_MEMBER);

      const archived = await h.as(OWNER, ACAD).membership.archived();
      expect(archived.map((m) => m.memberId)).toEqual([LEAVER_MEMBER]);
    });

    it("refuses to leave the academy without an owner", async () => {
      await h
        .as(OWNER, ACAD)
        .membership.archive({ memberId: memberId(ACAD, COOWNER) });
      expect(
        await rejectionCode(
          h.as(OWNER, ACAD).membership.archive({
            memberId: memberId(ACAD, OWNER),
          }),
        ),
      ).toBe("PRECONDITION_FAILED");
    });

    it("refuses to step the last owner down to instructor", async () => {
      await h
        .as(OWNER, ACAD)
        .membership.archive({ memberId: memberId(ACAD, COOWNER) });
      expect(
        await rejectionCode(
          h.as(OWNER, ACAD).membership.setRole({
            memberId: memberId(ACAD, OWNER),
            role: "instructor",
          }),
        ),
      ).toBe("PRECONDITION_FAILED");
    });

    it("refuses a pending applicant, who is declined instead", async () => {
      await h.pg.exec(
        `UPDATE "entity_membership" SET status = 'pending', role = 'member' WHERE id = '${LEAVER_MEMBER}';`,
      );
      expect(
        await rejectionCode(
          h.as(OWNER, ACAD).membership.archive({ memberId: LEAVER_MEMBER }),
        ),
      ).toBe("PRECONDITION_FAILED");
    });

    it("archives a suspended member", async () => {
      await h.as(OWNER, ACAD).membership.suspend({ memberId: LEAVER_MEMBER });
      await h.as(OWNER, ACAD).membership.archive({ memberId: LEAVER_MEMBER });
      expect(await memberStatus(h, LEAVER_MEMBER)).toBe("archived");
    });

    it("is owner-only", async () => {
      expect(
        await rejectionCode(
          h.as(LEAVER, ACAD).membership.archive({ memberId: FRIEND_MEMBER }),
        ),
      ).toBe("FORBIDDEN");
    });
  });

  describe("restore", () => {
    it("brings an archived member back active with their history", async () => {
      await h.as(OWNER, ACAD).rank.set({
        memberId: LEAVER_MEMBER,
        discipline: "bjj",
        belt: "Blue",
        stripes: 1,
      });
      await h
        .as(OWNER, ACAD)
        .note.add({ memberId: LEAVER_MEMBER, body: "Great guard passing." });

      await h.as(OWNER, ACAD).membership.archive({ memberId: LEAVER_MEMBER });
      await h.as(OWNER, ACAD).membership.restore({ memberId: LEAVER_MEMBER });

      expect(await memberStatus(h, LEAVER_MEMBER)).toBe("active");
      const ranks = await h
        .as(OWNER, ACAD)
        .rank.forMember({ memberId: LEAVER_MEMBER });
      expect(ranks.ranks[0]?.belt).toBe("Blue");
      const notes = await h
        .as(OWNER, ACAD)
        .note.forMember({ memberId: LEAVER_MEMBER });
      expect(notes).toHaveLength(1);
    });

    it("does not give the cancelled seats back", async () => {
      await seedParticipations(h.pg, [
        { classId: FUTURE, academyId: ACAD, studentId: LEAVER },
      ]);
      await h.pg.exec(
        `UPDATE "class" SET booking_count = 1 WHERE id = '${FUTURE}';`,
      );
      await h.as(OWNER, ACAD).membership.archive({ memberId: LEAVER_MEMBER });
      await h.as(OWNER, ACAD).membership.restore({ memberId: LEAVER_MEMBER });
      expect(await storedBookingCount(h.pg, FUTURE)).toBe(0);
    });

    it("still refuses a member who is neither suspended nor archived", async () => {
      expect(
        await rejectionCode(
          h.as(OWNER, ACAD).membership.restore({ memberId: LEAVER_MEMBER }),
        ),
      ).toBe("PRECONDITION_FAILED");
    });
  });

  describe("purge", () => {
    const seedFootprint = async () => {
      await seedParticipations(h.pg, [
        { classId: PAST, academyId: ACAD, studentId: LEAVER },
        { classId: FUTURE, academyId: ACAD, studentId: LEAVER },
      ]);
      await h.pg.exec(
        `UPDATE "class" SET booking_count = 1 WHERE id = '${FUTURE}';`,
      );
      await h.as(OWNER, ACAD).payments.setMemberDues({
        memberId: LEAVER_MEMBER,
        planId,
        nextDueAt: new Date().toISOString().slice(0, 10),
      });
      await h.as(OWNER, ACAD).rank.set({
        memberId: LEAVER_MEMBER,
        discipline: "bjj",
        belt: "Blue",
        stripes: 0,
      });
      await h
        .as(OWNER, ACAD)
        .note.add({ memberId: LEAVER_MEMBER, body: "Note about the leaver." });
      await h.as(OWNER, ACAD).referral.assign({
        studentMemberId: FRIEND_MEMBER,
        referrerMemberId: LEAVER_MEMBER,
      });
      await h.pg.exec(`
        INSERT INTO "notification" (id, academy_id, user_id, kind, title, body, created_at)
        VALUES (gen_random_uuid(), '${ACAD}', '${LEAVER}', 'news', 'Hi', 'Body', now());
      `);
    };

    it("leaves no row behind in any table", async () => {
      await seedFootprint();
      await h.as(OWNER, ACAD).membership.purge({ memberId: LEAVER_MEMBER });

      expect(
        await countRows(
          h,
          `SELECT count(*)::int AS n FROM "class_participation" WHERE student_id = $1`,
          LEAVER,
        ),
      ).toBe(0);
      expect(
        await countRows(
          h,
          `SELECT count(*)::int AS n FROM "notification" WHERE user_id = $1`,
          LEAVER,
        ),
      ).toBe(0);
      for (const table of [
        "member_dues",
        "member_rank",
        "rank_promotion",
        "member_note",
        "payment_claim",
      ]) {
        expect(
          await countRows(
            h,
            `SELECT count(*)::int AS n FROM "${table}" WHERE member_id = $1`,
            LEAVER_MEMBER,
          ),
        ).toBe(0);
      }
      expect(await memberStatus(h, LEAVER_MEMBER)).toBe("gone");
    });

    it("gives the seats back on the way out", async () => {
      await seedFootprint();
      await h.as(OWNER, ACAD).membership.purge({ memberId: LEAVER_MEMBER });
      expect(await storedBookingCount(h.pg, FUTURE)).toBe(0);
    });

    it("cuts the referral credit it leaves dangling", async () => {
      await seedFootprint();
      await h.as(OWNER, ACAD).membership.purge({ memberId: LEAVER_MEMBER });

      const res = await h.pg.query<{ referrer_member_id: string | null }>(
        `SELECT referrer_member_id FROM "member_referral" WHERE student_member_id = $1`,
        [FRIEND_MEMBER],
      );
      expect(res.rows[0]?.referrer_member_id).toBeNull();
    });

    it("deletes the sign-in account when this was their only gym", async () => {
      const res = await h
        .as(OWNER, ACAD)
        .membership.purge({ memberId: LEAVER_MEMBER });
      expect(res.accountDeleted).toBe(true);
      expect(
        await countRows(
          h,
          `SELECT count(*)::int AS n FROM "user" WHERE id = $1`,
          LEAVER,
        ),
      ).toBe(0);
    });

    it("keeps the account when they still train somewhere else", async () => {
      const res = await h
        .as(OWNER, ACAD)
        .membership.purge({ memberId: NOMAD_MEMBER });
      expect(res.accountDeleted).toBe(false);
      expect(
        await countRows(
          h,
          `SELECT count(*)::int AS n FROM "user" WHERE id = $1`,
          NOMAD,
        ),
      ).toBe(1);
      expect(
        await countRows(
          h,
          `SELECT count(*)::int AS n FROM "member" WHERE user_id = $1`,
          NOMAD,
        ),
      ).toBe(1);
    });

    it("does not touch the other academy's copy of their data", async () => {
      await seedParticipations(h.pg, [
        { classId: FUTURE, academyId: ACAD, studentId: NOMAD },
      ]);
      await h.pg.exec(`
        INSERT INTO "notification" (id, academy_id, user_id, kind, title, body, created_at)
        VALUES (gen_random_uuid(), '${OTHER}', '${NOMAD}', 'news', 'Other gym', 'Body', now());
      `);
      await h.as(OWNER, ACAD).membership.purge({ memberId: NOMAD_MEMBER });
      expect(
        await countRows(
          h,
          `SELECT count(*)::int AS n FROM "notification" WHERE user_id = $1`,
          NOMAD,
        ),
      ).toBe(1);
    });

    it("refuses to erase the caller's own membership", async () => {
      expect(
        await rejectionCode(
          h
            .as(OWNER, ACAD)
            .membership.purge({ memberId: memberId(ACAD, OWNER) }),
        ),
      ).toBe("PRECONDITION_FAILED");
    });

    it("erases a co-owner while another owner remains", async () => {
      const res = await h
        .as(OWNER, ACAD)
        .membership.purge({ memberId: memberId(ACAD, COOWNER) });
      expect(res.ok).toBe(true);
      expect(await memberStatus(h, memberId(ACAD, COOWNER))).toBe("gone");
    });

    it("leaves the gym owner their organization and their account", async () => {
      const res = await h
        .as(OWNER, ACAD)
        .membership.purge({ memberId: memberId(ACAD, COOWNER) });
      expect(res.accountDeleted).toBe(false);
      expect(
        await countRows(
          h,
          `SELECT count(*)::int AS n FROM "member" WHERE user_id = $1`,
          COOWNER,
        ),
      ).toBe(1);
      expect(
        await countRows(
          h,
          `SELECT count(*)::int AS n FROM "user" WHERE id = $1`,
          COOWNER,
        ),
      ).toBe(1);
    });

    it("is owner-only", async () => {
      expect(
        await rejectionCode(
          h.as(LEAVER, ACAD).membership.purge({ memberId: FRIEND_MEMBER }),
        ),
      ).toBe("FORBIDDEN");
    });

    it("cannot reach a member of another academy", async () => {
      expect(
        await rejectionCode(
          h
            .as(OWNER, ACAD)
            .membership.purge({ memberId: memberId(OTHER, OTHER_OWNER) }),
        ),
      ).toBe("NOT_FOUND");
    });
  });
});
