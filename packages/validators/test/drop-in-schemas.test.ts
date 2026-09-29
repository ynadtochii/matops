import { describe, expect, it } from "vitest";

import { DropInSubmitSchema, JoinByCodeSchema } from "../src";

describe("DropInSubmitSchema", () => {
  const token = "tok_abc123";
  const contact = {
    token,
    email: "ana@example.com",
    phone: "+351911111111",
  };

  const newBase = {
    kind: "new" as const,
    ...contact,
    firstName: "Ana",
    lastName: "Silva",
    consent: true as const,
    classId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    belt: "White",
  };

  it("accepts a valid new-visitor submission", () => {
    const result = DropInSubmitSchema.safeParse(newBase);
    expect(result.success).toBe(true);
  });

  it("requires consent to be true for new kind", () => {
    const result = DropInSubmitSchema.safeParse({ ...newBase, consent: false });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    const result = DropInSubmitSchema.safeParse({ ...newBase, kind: "other" });
    expect(result.success).toBe(false);
  });

  it("normalizes the phone for new kind", () => {
    const result = DropInSubmitSchema.safeParse({
      ...newBase,
      phone: "+351 911 111 111",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.kind === "new") {
      expect(result.data.phone).toBe("+351911111111");
    }
  });

  it("accepts a valid returning-visitor submission", () => {
    const result = DropInSubmitSchema.safeParse({
      kind: "returning",
      ...contact,
      classId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(result.success).toBe(true);
  });

  it("normalizes the phone for returning kind", () => {
    const result = DropInSubmitSchema.safeParse({
      kind: "returning",
      token,
      email: "ana@example.com",
      phone: "+351 911 111 111",
      classId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.kind === "returning") {
      expect(result.data.phone).toBe("+351911111111");
    }
  });

  it("new kind without firstName is rejected", () => {
    const { firstName: _, ...noFirst } = newBase;
    expect(DropInSubmitSchema.safeParse(noFirst).success).toBe(false);
  });
});

describe("JoinByCodeSchema", () => {
  const base = {
    code: "123456",
    firstName: "Ana",
    lastName: "Silva",
    phone: "+351911111111",
  };

  it("accepts a minimal join without signup answers", () => {
    expect(JoinByCodeSchema.safeParse(base).success).toBe(true);
  });

  it("accepts signup answers alongside the person fields", () => {
    const result = JoinByCodeSchema.safeParse({
      ...base,
      belt: "Blue",
      stripes: 2,
      emailUpdates: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.belt).toBe("Blue");
      expect(result.data.stripes).toBe(2);
    }
  });

  it("rejects a code that is not 6 digits", () => {
    expect(JoinByCodeSchema.safeParse({ ...base, code: "12345" }).success).toBe(
      false,
    );
    expect(
      JoinByCodeSchema.safeParse({ ...base, code: "abc123" }).success,
    ).toBe(false);
  });
});
