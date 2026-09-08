import { afterEach, describe, expect, it } from "vitest";

import { isUniqueViolation } from "../src/pg-error";
import { GENERIC_ERROR, publicErrorMessage } from "../src/trpc";

const original = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = original;
});

describe("isUniqueViolation", () => {
  it("reads the code off the driver error", () => {
    expect(
      isUniqueViolation(Object.assign(new Error("dup"), { code: "23505" })),
    ).toBe(true);
  });

  it("reads it through the wrapper drizzle throws", () => {
    const driver = Object.assign(new Error("dup"), { code: "23505" });
    const wrapped = new Error("Failed query", { cause: driver });
    expect(isUniqueViolation(new Error("outer", { cause: wrapped }))).toBe(
      true,
    );
  });

  it("rejects a different Postgres code", () => {
    const denied = Object.assign(new Error("permission denied"), {
      code: "42501",
    });
    expect(
      isUniqueViolation(new Error("Failed query", { cause: denied })),
    ).toBe(false);
  });

  it("rejects an error with no code at all", () => {
    expect(isUniqueViolation(new Error("connection terminated"))).toBe(false);
    expect(isUniqueViolation("not an object")).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });

  it("gives up rather than walking a cause cycle forever", () => {
    const a: { cause?: unknown } = {};
    const b = { cause: a };
    a.cause = b;
    expect(isUniqueViolation(a)).toBe(false);
  });
});

describe("publicErrorMessage", () => {
  it("replaces an unhandled server error in production", () => {
    process.env.NODE_ENV = "production";
    expect(
      publicErrorMessage(
        "INTERNAL_SERVER_ERROR",
        'duplicate key value violates unique constraint "membership_month_assignment_month"',
      ),
    ).toBe(GENERIC_ERROR);
  });

  it("keeps a deliberate error message in production", () => {
    process.env.NODE_ENV = "production";
    expect(publicErrorMessage("NOT_FOUND", "Class not found")).toBe(
      "Class not found",
    );
    expect(publicErrorMessage("FORBIDDEN", "Owner only")).toBe("Owner only");
  });

  it("keeps the raw text outside production", () => {
    process.env.NODE_ENV = "development";
    expect(
      publicErrorMessage("INTERNAL_SERVER_ERROR", "relation x missing"),
    ).toBe("relation x missing");
  });
});
