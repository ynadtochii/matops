import { describe, expect, it } from "vitest";

import { assertDevDatabase } from "../src/env-guard";

describe("assertDevDatabase", () => {
  it("refuses when DB_ENV is unset", () => {
    expect(() => assertDevDatabase("migrate", {})).toThrow(/not "dev"/);
  });

  it("refuses when DB_ENV is not dev", () => {
    expect(() => assertDevDatabase("migrate", { DB_ENV: "prod" })).toThrow(
      /not "dev"/,
    );
  });

  it("allows the dev branch", () => {
    expect(() => assertDevDatabase("migrate", { DB_ENV: "dev" })).not.toThrow();
  });

  it("allows the deploy pipeline's explicit override", () => {
    expect(() =>
      assertDevDatabase("migrate", { DB_ENV: "prod", ALLOW_PROD_WRITE: "1" }),
    ).not.toThrow();
  });

  it("allows CI", () => {
    expect(() => assertDevDatabase("migrate", { CI: "1" })).not.toThrow();
  });
});
