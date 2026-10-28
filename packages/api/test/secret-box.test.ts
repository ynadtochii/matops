import { describe, expect, it } from "vitest";

import { openSecret, parseSecretKey, sealSecret } from "../src/secret-box";
import {
  signStripePayload,
  StripeSignatureError,
  verifyStripeEvent,
} from "../src/stripe-signature";

const KEY = Buffer.alloc(32, 1);
const OTHER = Buffer.alloc(32, 2);

describe("secret box", () => {
  it("opens what it sealed, and only with the same key", () => {
    const sealed = sealSecret(KEY, "whsec_abc");
    expect(sealed).not.toContain("whsec_abc");
    expect(openSecret(KEY, sealed)).toBe("whsec_abc");
    expect(openSecret(OTHER, sealed)).toBeNull();
  });

  it("seals the same secret differently each time", () => {
    expect(sealSecret(KEY, "whsec_abc")).not.toBe(sealSecret(KEY, "whsec_abc"));
  });

  it("refuses a changed or malformed box", () => {
    const [v, iv, tag, body] = sealSecret(KEY, "whsec_abc").split(".");
    const flipped = `${v}.${iv}.${tag}.${body?.startsWith("A") ? "B" : "A"}${body?.slice(1)}`;
    expect(openSecret(KEY, flipped)).toBeNull();
    expect(openSecret(KEY, "garbage")).toBeNull();
    expect(openSecret(KEY, "v2.a.b.c")).toBeNull();
  });

  it("accepts only a 32-byte base64 key", () => {
    expect(parseSecretKey(KEY.toString("base64"))?.equals(KEY)).toBe(true);
    expect(parseSecretKey(Buffer.alloc(16).toString("base64"))).toBeNull();
    expect(parseSecretKey(undefined)).toBeNull();
    expect(parseSecretKey("")).toBeNull();
  });
});

describe("stripe signature", () => {
  const now = 1_800_000_000;
  const body = JSON.stringify({
    id: "evt_1",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: { id: "cs_1" } },
  });

  it("accepts a correctly signed event", () => {
    const event = verifyStripeEvent(
      "whsec_x",
      body,
      signStripePayload("whsec_x", body, now),
      now,
    );
    expect(event).toEqual({
      id: "evt_1",
      type: "checkout.session.completed",
      livemode: false,
      object: { id: "cs_1" },
    });
  });

  it("refuses a missing header, another secret, a changed body and an old signature", () => {
    const header = signStripePayload("whsec_x", body, now);
    for (const run of [
      () => verifyStripeEvent("whsec_x", body, null, now),
      () => verifyStripeEvent("whsec_y", body, header, now),
      () => verifyStripeEvent("whsec_x", `${body} `, header, now),
      () =>
        verifyStripeEvent(
          "whsec_x",
          body,
          signStripePayload("whsec_x", body, now - 301),
          now,
        ),
    ]) {
      expect(run).toThrow(StripeSignatureError);
    }
  });

  it("refuses a signed body that is not an event", () => {
    const notEvent = JSON.stringify({ hello: "world" });
    expect(() =>
      verifyStripeEvent(
        "whsec_x",
        notEvent,
        signStripePayload("whsec_x", notEvent, now),
        now,
      ),
    ).toThrow(StripeSignatureError);
  });
});
