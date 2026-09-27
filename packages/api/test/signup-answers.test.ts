import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Notifications from "@matops/notifications";

import type { Harness } from "./helpers";
import { harness, memberId, rejectionCode } from "./helpers";

const sendEmail = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({ sent: true, ok: true, outcome: "accepted" as const }),
  ),
);

vi.mock("@matops/notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof Notifications>()),
  sendEmail,
}));

const ACAD = "acad_signup";
const OWNER = "u_signup_owner";
const COACH = "u_signup_coach";
const STUDENT = "u_signup_student";
const JOINER = "u_signup_joiner";

const PERSON = { firstName: "Ana", lastName: "Silva", phone: "+351911111111" };

describe("sign-up answers (ADR 146)", () => {
  let h: Harness;

  beforeEach(async () => {
    sendEmail.mockClear();
    h = await harness([
      {
        id: ACAD,
        code: "700246",
        members: [
          { userId: OWNER, role: "owner", status: "active", name: "Owner" },
          {
            userId: COACH,
            role: "instructor",
            status: "active",
            name: "Coach",
          },
          {
            userId: STUDENT,
            role: "student",
            status: "active",
            name: "Student",
          },
        ],
      },
    ]);
    await h.pg.exec(`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES ('${JOINER}', 'Joiner', 'joiner@test.local', true, now(), now());
    `);
  });

  afterEach(async () => {
    await h.close();
  });

  const inviteToken = async (role: "student" | "instructor" = "student") =>
    (await h.as(OWNER, ACAD).invite.create({ role })).token;

  const joinerMemberId = async () => {
    const res = await h.pg.query<{ id: string }>(
      `SELECT id FROM "entity_membership" WHERE entity_id = $1 AND user_id = $2`,
      [ACAD, JOINER],
    );
    return res.rows[0]?.id ?? null;
  };

  const ranks = async () =>
    (
      await h.pg.query<{ belt: string; stripes: number; updated_by: string }>(
        `SELECT belt, stripes, updated_by FROM "member_rank" WHERE member_id = $1`,
        [await joinerMemberId()],
      )
    ).rows;

  const notes = async () =>
    (
      await h.pg.query<{ body: string; author_id: string }>(
        `SELECT body, author_id FROM "member_note" WHERE member_id = $1`,
        [await joinerMemberId()],
      )
    ).rows;

  const optedInAt = async (id: string | null) =>
    (
      await h.pg.query<{ at: Date | null }>(
        `SELECT email_updates_at AS at FROM "entity_membership" WHERE id = $1`,
        [id],
      )
    ).rows[0]?.at ?? null;

  it("saves the belt, the health note and the email opt-in", async () => {
    await h.as(OWNER, ACAD).academy.updateSettings({
      signupHealthQuestion: true,
    });
    const token = await inviteToken();

    await h.as(JOINER, null).membership.join({
      token,
      ...PERSON,
      belt: "Blue",
      stripes: 2,
      health: "Left knee, no heel hooks",
      emailUpdates: true,
    });

    expect(await ranks()).toEqual([
      { belt: "Blue", stripes: 2, updated_by: JOINER },
    ]);
    expect(await notes()).toEqual([
      { body: "Left knee, no heel hooks", author_id: JOINER },
    ]);
    expect(await optedInAt(await joinerMemberId())).not.toBeNull();

    const id = await joinerMemberId();
    const staffNotes = await h
      .as(OWNER, ACAD)
      .note.forMember({ memberId: id ?? "" });
    expect(staffNotes).toMatchObject([{ fromSignup: true }]);
  });

  it("shows the health question flag in settings", async () => {
    expect(
      (await h.as(OWNER, ACAD).academy.settings()).signupHealthQuestion,
    ).toBe(false);
    await h.as(OWNER, ACAD).academy.updateSettings({
      signupHealthQuestion: true,
    });
    expect(
      (await h.as(OWNER, ACAD).academy.settings()).signupHealthQuestion,
    ).toBe(true);
  });

  it("drops the health answer while the question is off", async () => {
    const token = await inviteToken();
    await h.as(JOINER, null).membership.join({
      token,
      ...PERSON,
      belt: "White",
      health: "Asthma",
    });

    expect(await notes()).toEqual([]);
    expect(await optedInAt(await joinerMemberId())).toBeNull();
  });

  it("refuses a belt outside the ladder before writing anything", async () => {
    const token = await inviteToken();
    expect(
      await rejectionCode(
        h.as(JOINER, null).membership.join({ token, ...PERSON, belt: "Red" }),
      ),
    ).toBe("BAD_REQUEST");
    expect(await joinerMemberId()).toBeNull();
  });

  it("asks an instructor nothing", async () => {
    await h.as(OWNER, ACAD).academy.updateSettings({
      signupHealthQuestion: true,
    });
    const token = await inviteToken("instructor");
    await h.as(JOINER, null).membership.join({
      token,
      ...PERSON,
      belt: "Black",
      health: "Asthma",
    });

    expect(await ranks()).toEqual([]);
    expect(await notes()).toEqual([]);
  });

  it("writes one note and one rank when the student taps join twice", async () => {
    await h.as(OWNER, ACAD).academy.updateSettings({
      signupHealthQuestion: true,
    });
    const token = await inviteToken();
    const answers = { token, ...PERSON, belt: "Blue", health: "Asthma" };

    await h.as(JOINER, null).membership.join(answers);
    await h.as(JOINER, null).membership.join({ ...answers, belt: "Purple" });

    expect(await ranks()).toMatchObject([{ belt: "Blue" }]);
    expect(await notes()).toHaveLength(1);
  });

  it("lets a student turn gym news on and off", async () => {
    const id = memberId(ACAD, STUDENT);
    await h
      .as(STUDENT, ACAD)
      .membership.setEmailUpdates({ emailUpdates: true });
    expect(await optedInAt(id)).not.toBeNull();
    expect(
      (await h.as(STUDENT, ACAD).membership.emailUpdates()).optedInAt,
    ).not.toBeNull();

    await h
      .as(STUDENT, ACAD)
      .membership.setEmailUpdates({ emailUpdates: false });
    expect(await optedInAt(id)).toBeNull();
  });

  it("refuses the news switch for staff", async () => {
    expect(
      await rejectionCode(
        h.as(COACH, ACAD).membership.setEmailUpdates({ emailUpdates: true }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("emails the student on approval without a news opt-in", async () => {
    const token = await inviteToken();
    await h
      .as(JOINER, null)
      .membership.join({ token, ...PERSON, belt: "White" });

    await h
      .as(OWNER, ACAD)
      .membership.approve({ memberId: (await joinerMemberId()) ?? "" });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "joiner@test.local" }),
    );
  });

  describe("agreement", () => {
    const TEXT_V1 =
      "You understand BJJ is a contact sport and you train at your own risk.";
    const TEXT_V2 =
      "You understand BJJ is a full-contact sport and you train at your own risk.";

    const acceptances = async () =>
      (
        await h.pg.query<{ waiver_id: string }>(
          `SELECT waiver_id FROM "waiver_acceptance" WHERE member_id = $1`,
          [await joinerMemberId()],
        )
      ).rows;

    const requireAgreement = async (body = TEXT_V1) => {
      await h.as(OWNER, ACAD).academy.saveWaiver({ body });
      await h.as(OWNER, ACAD).academy.updateSettings({ waiverRequired: true });
      const { waiver } = await h.as(OWNER, ACAD).academy.settings();
      return waiver?.id ?? "";
    };

    it("saves a new version only when the text changes", async () => {
      const owner = h.as(OWNER, ACAD).academy;
      await owner.saveWaiver({ body: TEXT_V1 });
      await owner.saveWaiver({ body: TEXT_V1 });
      await owner.saveWaiver({ body: TEXT_V2 });
      expect((await owner.settings()).waiver?.body).toBe(TEXT_V2);
      const versions = await h.pg.query(
        `SELECT id FROM "academy_waiver" WHERE academy_id = $1`,
        [ACAD],
      );
      expect(versions.rows).toHaveLength(2);
    });

    it("refuses to turn on before any text is saved", async () => {
      expect(
        await rejectionCode(
          h.as(OWNER, ACAD).academy.updateSettings({ waiverRequired: true }),
        ),
      ).toBe("BAD_REQUEST");
    });

    it("refuses an instructor editing the text", async () => {
      expect(
        await rejectionCode(
          h.as(COACH, ACAD).academy.saveWaiver({ body: TEXT_V1 }),
        ),
      ).toBe("FORBIDDEN");
    });

    it("shows the text on the join screen only while it is required", async () => {
      await h.as(OWNER, ACAD).academy.saveWaiver({ body: TEXT_V1 });
      const token = await inviteToken();
      expect((await h.as(JOINER, null).invite.resolve({ token })).waiver).toBe(
        null,
      );

      await h.as(OWNER, ACAD).academy.updateSettings({ waiverRequired: true });
      expect(
        (await h.as(JOINER, null).invite.resolve({ token })).waiver,
      ).toMatchObject({ body: TEXT_V1 });
    });

    it("records the version the student accepted", async () => {
      const waiverId = await requireAgreement();
      const token = await inviteToken();
      await h
        .as(JOINER, null)
        .membership.join({ token, ...PERSON, belt: "White", waiverId });

      expect(await acceptances()).toEqual([{ waiver_id: waiverId }]);
      const history = await h
        .as(OWNER, ACAD)
        .membership.memberHistory({ memberId: (await joinerMemberId()) ?? "" });
      expect(history.waiverAcceptedAt).not.toBeNull();
    });

    it("refuses a join without the agreement before writing anything", async () => {
      await requireAgreement();
      const token = await inviteToken();
      expect(
        await rejectionCode(
          h
            .as(JOINER, null)
            .membership.join({ token, ...PERSON, belt: "White" }),
        ),
      ).toBe("BAD_REQUEST");
      expect(await joinerMemberId()).toBeNull();
    });

    it("refuses a version the owner has since replaced", async () => {
      const oldId = await requireAgreement();
      await h.as(OWNER, ACAD).academy.saveWaiver({ body: TEXT_V2 });
      const token = await inviteToken();
      expect(
        await rejectionCode(
          h.as(JOINER, null).membership.join({
            token,
            ...PERSON,
            belt: "White",
            waiverId: oldId,
          }),
        ),
      ).toBe("BAD_REQUEST");
    });

    it("does not ask an instructor to agree", async () => {
      await requireAgreement();
      const token = await inviteToken("instructor");
      await h.as(JOINER, null).membership.join({ token, ...PERSON });

      expect(await joinerMemberId()).not.toBeNull();
      expect(await acceptances()).toEqual([]);
    });
  });
});
