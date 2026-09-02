import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { leadQueues, needsFollowUp } from "@matops/domain";

import type { Harness } from "./helpers";
import { resetRateLimits } from "../src/rate-limit";
import { harness, rejectionCode, seedClasses } from "./helpers";

const A = "org_a";
const OWNER = "u_owner";
const COACH = "u_coach";
const JOINER = "u_joiner";

const TODAY = "aaaaaaaa-0000-4000-8000-00000000010a";

let open: Harness | null = null;

beforeEach(() => resetRateLimits());

afterEach(async () => {
  await open?.close();
  open = null;
});

async function base(): Promise<Harness> {
  const h = await harness([
    {
      id: A,
      code: "100001",
      members: [
        { userId: OWNER, role: "owner", status: "active" },
        { userId: COACH, role: "instructor", status: "active" },
        { userId: JOINER, role: "student", status: "active", name: "Ana" },
      ],
    },
  ]);
  open = h;
  await seedClasses(h.pg, [
    { id: TODAY, academyId: A, instructorId: COACH, startsInMinutes: -60 },
  ]);
  await h.pg.query(
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
     VALUES ('u_new', 'New Joiner', 'u_new@test.local', true, now(), now())`,
  );
  return h;
}

const VISITOR = {
  classId: TODAY,
  firstName: "Ana",
  lastName: "Silva",
  phone: "+351912345678",
};

function queues(rows: { stage: string; visitCount: number }[]) {
  return leadQueues(
    rows.map((l) => ({
      stage: l.stage as "new",
      activity: {
        visits: l.visitCount,
        lastVisitAt: null,
        nextBookingAt: null,
      },
    })),
  );
}

describe("a lead is a stage plus what the person actually did", () => {
  it("starts at new, from the front desk, with the visit recorded", async () => {
    const h = await base();
    await h.as(COACH, A).attendance.addVisitor(VISITOR);
    const [lead] = await h.as(OWNER, A).dropIn.list();
    expect(lead).toMatchObject({
      stage: "new",
      source: "staff",
      visitCount: 1,
    });
  });

  it("shows a person who trained and was never followed up in both queues", async () => {
    const h = await base();
    await h.as(COACH, A).attendance.addVisitor(VISITOR);
    const rows = await h.as(OWNER, A).dropIn.list();
    expect(queues(rows)).toEqual({ newLeads: 1, trainedNotJoined: 1 });
  });

  it("clears the new queue when the owner marks them contacted", async () => {
    const h = await base();
    await h.as(COACH, A).attendance.addVisitor(VISITOR);
    const [lead] = await h.as(OWNER, A).dropIn.list();
    await h
      .as(OWNER, A)
      .dropIn.setStage({ id: lead?.id ?? "", stage: "contacted" });

    const rows = await h.as(OWNER, A).dropIn.list();
    expect(rows[0]?.stage).toBe("contacted");
    expect(rows[0]?.contactedAt).not.toBeNull();
    expect(queues(rows)).toEqual({ newLeads: 0, trainedNotJoined: 1 });
  });

  it("takes a ghosted lead out of both queues and keeps the row", async () => {
    const h = await base();
    await h.as(COACH, A).attendance.addVisitor(VISITOR);
    const [lead] = await h.as(OWNER, A).dropIn.list();
    await h
      .as(OWNER, A)
      .dropIn.setStage({ id: lead?.id ?? "", stage: "ghosted" });

    const rows = await h.as(OWNER, A).dropIn.list();
    expect(rows).toHaveLength(1);
    expect(queues(rows)).toEqual({ newLeads: 0, trainedNotJoined: 0 });
  });

  it("stamps invited only when the owner says so, not on a link copy", async () => {
    const h = await base();
    await h.as(COACH, A).attendance.addVisitor(VISITOR);
    const [lead] = await h.as(OWNER, A).dropIn.list();
    await h.as(OWNER, A).dropIn.markInvited({ id: lead?.id ?? "" });
    expect((await h.as(OWNER, A).dropIn.list())[0]?.stage).toBe("invited");
  });

  it("keeps the leads list owner-only", async () => {
    const h = await base();
    expect(await rejectionCode(h.as(COACH, A).dropIn.list())).toBe("FORBIDDEN");
  });
});

describe("a lead becomes a member on a phone match at self-join", () => {
  it("flips the lead to joined and links the user, whatever the format", async () => {
    const h = await base();
    await h.as(COACH, A).attendance.addVisitor(VISITOR);
    await h.as("u_new", null).membership.joinByCode({
      code: "100001",
      firstName: "Ana",
      lastName: "Silva",
      phone: "912 345 678",
    });

    const [lead] = await h.as(OWNER, A).dropIn.list();
    expect(lead?.stage).toBe("joined");
    expect(lead?.convertedUserId).toBe("u_new");
  });

  it("leaves a lead alone when nobody's phone matches", async () => {
    const h = await base();
    await h.as(COACH, A).attendance.addVisitor(VISITOR);
    await h.as("u_new", null).membership.joinByCode({
      code: "100001",
      firstName: "Bo",
      lastName: "Reis",
      phone: "+351999888777",
    });
    expect((await h.as(OWNER, A).dropIn.list())[0]?.stage).toBe("new");
  });

  it("takes a joined lead out of the follow-up queue", async () => {
    const h = await base();
    await h.as(COACH, A).attendance.addVisitor(VISITOR);
    await h.as("u_new", null).membership.joinByCode({
      code: "100001",
      firstName: "Ana",
      lastName: "Silva",
      phone: "912345678",
    });
    const rows = await h.as(OWNER, A).dropIn.list();
    expect(
      needsFollowUp({
        stage: rows[0]?.stage ?? "new",
        activity: {
          visits: rows[0]?.visitCount ?? 0,
          lastVisitAt: null,
          nextBookingAt: null,
        },
      }),
    ).toBe(false);
  });

  it("links a member by hand when the two phones differ", async () => {
    const h = await base();
    await h.as(COACH, A).attendance.addVisitor(VISITOR);
    const [lead] = await h.as(OWNER, A).dropIn.list();
    await h.as(OWNER, A).dropIn.markJoined({
      id: lead?.id ?? "",
      userId: JOINER,
    });
    const rows = await h.as(OWNER, A).dropIn.list();
    expect(rows[0]).toMatchObject({ stage: "joined", convertedUserId: JOINER });
  });

  it("refuses to link somebody who is not a member of this academy", async () => {
    const h = await base();
    await h.as(COACH, A).attendance.addVisitor(VISITOR);
    const [lead] = await h.as(OWNER, A).dropIn.list();
    expect(
      await rejectionCode(
        h.as(OWNER, A).dropIn.markJoined({
          id: lead?.id ?? "",
          userId: "u_stranger",
        }),
      ),
    ).toBe("NOT_FOUND");
  });
});

/**
 * roadmap K.0: a visit is a `present` participation, so drop-ins never count and
 * O10 always agrees with O5. Giving visitors an attendance status is exactly the
 * change that could break that by accident, so it is a written rule with a test.
 */
describe("no statistics query joins the visits table", () => {
  const READERS = ["router/attendance.ts", "router/class.ts"];

  it("is read by the roster and the class screen, and nowhere else", async () => {
    const srcDir = fileURLToPath(new URL("../src", import.meta.url));
    const files = (await readdir(srcDir, { recursive: true }))
      .map(String)
      .filter((f) => f.endsWith(".ts"));
    const users: string[] = [];
    for (const file of files) {
      const source = await readFile(join(srcDir, file), "utf8");
      if (source.includes("dropInVisit"))
        users.push(file.replaceAll("\\", "/"));
    }
    expect(users.sort()).toEqual([...READERS].sort());
  });
});

/** A lead who agreed to be contacted: the wall QR form, not the front desk. */
async function consentedLead(h: Harness, email = "ana@example.com") {
  await h
    .as("nobody", null, new Headers({ "x-forwarded-for": "1.1.1.1" }))
    .dropIn.submit({
      academyId: A,
      firstName: "Ana",
      lastName: "Silva",
      phone: "+351911111111",
      consent: true,
      email,
    });
  const rows = await h.as(OWNER, A).dropIn.list();
  const lead = rows[0];
  if (!lead) throw new Error("no lead was created");
  return lead;
}

async function memberRows(h: Harness) {
  const res = await h.pg.query<{
    user_id: string;
    email: string;
    status: string;
    role: string;
    email_verified: boolean;
  }>(
    `SELECT m.user_id, u.email, m.status, m.role, u.email_verified
       FROM "member" m JOIN "user" u ON u.id = m.user_id
      WHERE m.organization_id = ${"'"}${A}${"'"} ORDER BY u.email`,
  );
  return res.rows;
}

describe("the owner turns a lead into a member", () => {
  it("makes an unverified account, activates it, and flips the lead", async () => {
    const h = await base();
    const lead = await consentedLead(h, "ana@example.com");

    const res = await h
      .as(OWNER, A)
      .dropIn.promote({ id: lead.id, email: "ana@example.com" });
    expect(res).toMatchObject({ status: "active", existingAccount: false });

    const [made] = (await memberRows(h)).filter(
      (m) => m.email === "ana@example.com",
    );
    expect(made).toMatchObject({
      status: "active",
      role: "student",
      email_verified: false,
    });

    const [after] = await h.as(OWNER, A).dropIn.list();
    expect(after?.stage).toBe("joined");
    expect(after?.convertedUserId).toBe(made?.user_id);
  });

  it("leaves an address that already has an account pending, and reuses it", async () => {
    const h = await base();
    const lead = await consentedLead(h, "u_joiner@test.local");

    const res = await h
      .as(OWNER, A)
      .dropIn.promote({ id: lead.id, email: "u_joiner@test.local" });
    expect(res).toMatchObject({ existingAccount: true });

    const rows = await memberRows(h);
    expect(rows.filter((m) => m.email === "u_joiner@test.local")).toHaveLength(
      1,
    );
    expect((await h.as(OWNER, A).dropIn.list())[0]?.convertedUserId).toBe(
      JOINER,
    );
  });

  it("matches the address case-insensitively rather than forking an account", async () => {
    const h = await base();
    const lead = await consentedLead(h, "U_Joiner@Test.Local");

    await h
      .as(OWNER, A)
      .dropIn.promote({ id: lead.id, email: "U_Joiner@Test.Local" });
    expect(await memberRows(h)).toHaveLength(3);
  });

  it("refuses a front-desk visitor, who never agreed to be contacted", async () => {
    const h = await base();
    await h.as(COACH, A).attendance.addVisitor(VISITOR);
    const [lead] = await h.as(OWNER, A).dropIn.list();

    expect(
      await rejectionCode(
        h
          .as(OWNER, A)
          .dropIn.promote({ id: lead?.id ?? "", email: "ana@example.com" }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("refuses a lead with no email at all", async () => {
    const h = await base();
    const lead = await consentedLead(h);
    await h.pg.query(`UPDATE drop_in SET email = NULL WHERE id = $1`, [
      lead.id,
    ]);

    expect(
      await rejectionCode(
        h
          .as(OWNER, A)
          .dropIn.promote({ id: lead.id, email: "ana@example.com" }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("refuses an email that is not the one stored on the lead", async () => {
    const h = await base();
    const lead = await consentedLead(h, "ana@example.com");

    expect(
      await rejectionCode(
        h
          .as(OWNER, A)
          .dropIn.promote({ id: lead.id, email: "other@example.com" }),
      ),
    ).toBe("CONFLICT");
  });

  it("keeps promotion and the email edit owner-only", async () => {
    const h = await base();
    const lead = await consentedLead(h, "ana@example.com");

    expect(
      await rejectionCode(
        h
          .as(COACH, A)
          .dropIn.promote({ id: lead.id, email: "ana@example.com" }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await rejectionCode(
        h
          .as(COACH, A)
          .dropIn.setEmail({ id: lead.id, email: "ana@example.com" }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("takes the email an owner types, then promotes on it", async () => {
    const h = await base();
    const lead = await consentedLead(h);
    await h.pg.exec(`UPDATE "drop_in" SET email = NULL`);

    await h
      .as(OWNER, A)
      .dropIn.setEmail({ id: lead.id, email: "ana@example.com" });
    const res = await h
      .as(OWNER, A)
      .dropIn.promote({ id: lead.id, email: "ana@example.com" });

    expect(res.status).toBe("active");
  });

  it("refuses to reach a lead in another academy", async () => {
    const h = await base();
    const lead = await consentedLead(h, "ana@example.com");

    expect(
      await rejectionCode(
        h.as(OWNER, "org_b").dropIn.promote({
          id: lead.id,
          email: "ana@example.com",
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});
