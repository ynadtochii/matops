import { afterEach, describe, expect, it } from "vitest";

import { GENERIC_ERROR, publicErrorMessage } from "../src/trpc";

const original = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = original;
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
