import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedAcademies } from "./helpers";

const ORG = "acad_pay_method";
const OTHER = "acad_pay_method_other";
const OWNER = "u_pay_method_owner";
const MANAGER = "u_pay_method_manager";
const COACH = "u_pay_method_coach";
const STUDENT = "u_pay_method_student";
const STRANGER = "u_pay_method_stranger";

describe("ways to pay (ADR 158)", () => {
  let h: Harness;

  const owner = () => h.as(OWNER, ORG);
  const manager = () => h.as(MANAGER, ORG);
  const student = () => h.as(STUDENT, ORG);
  const add = (kind: "bank" | "mbway" | "cash" | "other", label: string) =>
    owner().paymentMethod.save({
      kind,
      label,
      details: kind === "cash" ? "" : `${label} details`,
      enabled: true,
    });

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ORG,
        code: "700090",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: MANAGER, role: "manager", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
        ],
      },
      {
        id: OTHER,
        code: "700091",
        members: [{ userId: STRANGER, role: "owner", status: "active" }],
      },
    ]);
  });

  afterAll(() => h.close());

  it("starts empty and is closed to coaches and students", async () => {
    expect(await owner().paymentMethod.list()).toEqual([]);
    expect(await rejectionCode(h.as(COACH, ORG).paymentMethod.list())).toBe(
      "FORBIDDEN",
    );
    expect(
      await rejectionCode(
        student().paymentMethod.save({
          kind: "cash",
          label: "Cash",
          details: "",
          enabled: true,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("lets only the owner change them, and a manager read them", async () => {
    expect(
      await rejectionCode(
        manager().paymentMethod.save({
          kind: "bank",
          label: "Bank transfer",
          details: "PT50 0000",
          enabled: true,
        }),
      ),
    ).toBe("FORBIDDEN");
    expect(await manager().paymentMethod.list()).toEqual([]);
  });

  it("adds methods in order and shows students only the visible ones", async () => {
    await add("bank", "Bank transfer");
    await add("mbway", "MB WAY");
    const cash = await owner().paymentMethod.save({
      kind: "cash",
      label: "Cash",
      details: "",
      enabled: false,
    });
    expect((await owner().paymentMethod.list()).map((m) => m.label)).toEqual([
      "Bank transfer",
      "MB WAY",
      "Cash",
    ]);
    expect(
      (await student().accessPlan.mine()).paymentMethods.map((m) => m.label),
    ).toEqual(["Bank transfer", "MB WAY"]);

    await owner().paymentMethod.save({
      id: cash.id,
      kind: "cash",
      label: "Cash at the desk",
      details: "",
      enabled: true,
    });
    expect(
      (await student().accessPlan.mine()).paymentMethods.map((m) => m.kind),
    ).toEqual(["bank", "mbway", "cash"]);
  });

  it("moves methods, by the owner only", async () => {
    const ids = (await owner().paymentMethod.list()).map((m) => m.id);
    expect(await rejectionCode(manager().paymentMethod.reorder({ ids }))).toBe(
      "FORBIDDEN",
    );
    await owner().paymentMethod.reorder({ ids: [...ids].reverse() });
    expect((await owner().paymentMethod.list()).map((m) => m.kind)).toEqual([
      "cash",
      "mbway",
      "bank",
    ]);
  });

  it("refuses a bank method with no details", async () => {
    expect(
      await rejectionCode(
        owner().paymentMethod.save({
          kind: "bank",
          label: "Bank",
          details: "",
          enabled: true,
        }),
      ),
    ).toBe("BAD_REQUEST");
  });

  it("keeps another gym's methods out of reach", async () => {
    const [first] = await owner().paymentMethod.list();
    if (!first) throw new Error("no method");
    const other = h.as(STRANGER, OTHER);
    expect(await other.paymentMethod.list()).toEqual([]);
    expect(
      await rejectionCode(other.paymentMethod.remove({ id: first.id })),
    ).toBe("NOT_FOUND");
    expect(
      await rejectionCode(
        other.paymentMethod.save({ ...first, label: "Mine now" }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("removes a method", async () => {
    const [first] = await owner().paymentMethod.list();
    if (!first) throw new Error("no method");
    await owner().paymentMethod.remove({ id: first.id });
    expect((await owner().paymentMethod.list()).length).toBe(2);
  });

  it("stops at the limit", async () => {
    for (let i = 0; i < 8; i++) await add("other", `Other ${i}`);
    expect(await rejectionCode(add("other", "One too many"))).toBe(
      "PRECONDITION_FAILED",
    );
  });

  it("counts as the setup step for how students pay", async () => {
    await owner().academy.setMembershipEnforced({ enforced: true });
    const setup = await owner().organization.setup();
    expect(setup.items.find((i) => i.key === "pay")).toBeUndefined();
    await owner().accessPlan.create({
      name: "Adults",
      entityIds: [ORG],
      priceMinor: 4500,
      currency: "EUR",
    });
    expect(
      (await owner().organization.setup()).items.find((i) => i.key === "pay")
        ?.done,
    ).toBe(true);
  });
});
