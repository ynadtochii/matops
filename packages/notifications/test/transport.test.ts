import { describe, expect, it } from "vitest";

import { sendEmail } from "../src/resend";
import { sendPush } from "../src/expo-push";

/**
 * Guard-path tests only — the network paths are exercised on real infra (see the
 * plan's verification). These assert the never-throw / no-op behavior that keeps
 * a notification from ever failing the mutation that fired it. None hit fetch.
 */

describe("sendPush", () => {
  it("no-ops on an empty token list", async () => {
    const r = await sendPush([], { title: "t", body: "b" });
    expect(r).toEqual({ sent: 0, ok: true });
  });

  it("filters out non-Expo tokens (no send)", async () => {
    const r = await sendPush(["not-an-expo-token", ""], {
      title: "t",
      body: "b",
    });
    expect(r).toEqual({ sent: 0, ok: true });
  });
});

describe("sendEmail", () => {
  it("no-ops (ok) when Resend is unconfigured", async () => {
    // RESEND_API_KEY / RESEND_FROM are unset in the test env.
    const r = await sendEmail({ to: "a@b.com", subject: "s", text: "t" });
    expect(r).toEqual({ sent: false, ok: true });
  });
});
