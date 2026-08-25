import { describe, expect, it } from "vitest";

import { cronVerdict } from "../src/cron-auth";

const SECRET = "s3cret";

describe("cronVerdict", () => {
  it("lets the scheduler through with the right bearer token", () => {
    expect(
      cronVerdict({
        authorization: `Bearer ${SECRET}`,
        secret: SECRET,
        isProduction: true,
      }),
    ).toEqual({ ok: true });
  });

  it("turns a stranger away with 401", () => {
    for (const authorization of [
      null,
      "",
      "Bearer wrong",
      SECRET,
      `bearer ${SECRET}`,
      `Bearer ${SECRET} `,
    ]) {
      expect(
        cronVerdict({ authorization, secret: SECRET, isProduction: true }),
      ).toEqual({ ok: false, status: 401, message: "Unauthorized" });
    }
  });

  it("refuses to run unprotected in production", () => {
    expect(
      cronVerdict({
        authorization: `Bearer ${SECRET}`,
        secret: undefined,
        isProduction: true,
      }),
    ).toEqual({
      ok: false,
      status: 500,
      message: "CRON_SECRET is not configured",
    });
  });

  it("runs unprotected outside production", () => {
    expect(
      cronVerdict({
        authorization: null,
        secret: undefined,
        isProduction: false,
      }),
    ).toEqual({ ok: true });
  });

  it("still checks the token outside production once a secret is set", () => {
    expect(
      cronVerdict({
        authorization: "Bearer wrong",
        secret: SECRET,
        isProduction: false,
      }),
    ).toEqual({ ok: false, status: 401, message: "Unauthorized" });
  });

  it("treats an empty secret as no secret", () => {
    expect(
      cronVerdict({ authorization: null, secret: "", isProduction: false }),
    ).toEqual({ ok: true });
    expect(
      cronVerdict({ authorization: null, secret: "", isProduction: true }),
    ).toEqual({
      ok: false,
      status: 500,
      message: "CRON_SECRET is not configured",
    });
  });
});
