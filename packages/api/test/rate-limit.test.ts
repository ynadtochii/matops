import { beforeEach, describe, expect, it } from "vitest";

import { clientIp, MAX_KEYS, resetRateLimits, take } from "../src/rate-limit";

describe("fixed-window rate limit", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to max in one window, then refuses", () => {
    const results = [1, 2, 3, 4].map(() => take("ip", 3, 1000, 0));
    expect(results).toEqual([true, true, true, false]);
  });

  it("allows again once the window rolls over", () => {
    take("ip", 1, 1000, 0);
    expect(take("ip", 1, 1000, 999)).toBe(false);
    expect(take("ip", 1, 1000, 1000)).toBe(true);
  });

  it("counts each key on its own", () => {
    expect(take("a", 1, 1000, 0)).toBe(true);
    expect(take("b", 1, 1000, 0)).toBe(true);
    expect(take("a", 1, 1000, 0)).toBe(false);
  });

  it("forgets the window rather than growing past the key cap", () => {
    for (let i = 0; i < MAX_KEYS; i++) take(`ip${i}`, 1, 1000, 0);
    expect(take("ip0", 1, 1000, 0)).toBe(false);
    take("one-too-many", 1, 1000, 0);
    expect(take("ip0", 1, 1000, 0)).toBe(true);
  });

  it("keeps refusing inside the window rather than resetting on a refusal", () => {
    take("ip", 1, 1000, 0);
    take("ip", 1, 1000, 100);
    expect(take("ip", 1, 1000, 200)).toBe(false);
    expect(take("ip", 1, 1000, 1000)).toBe(true);
  });
});

describe("client ip", () => {
  const h = (value?: string) =>
    new Headers(value === undefined ? {} : { "x-forwarded-for": value });

  it("takes the first entry, the one the proxy chain cannot forge", () => {
    expect(clientIp(h("1.2.3.4, 10.0.0.1, 10.0.0.2"))).toBe("1.2.3.4");
    expect(clientIp(h("1.2.3.4"))).toBe("1.2.3.4");
  });

  it("fails closed into one shared bucket when the header is missing or blank", () => {
    expect(clientIp(h())).toBe("unknown");
    expect(clientIp(h(""))).toBe("unknown");
    expect(clientIp(h("  , 10.0.0.1"))).toBe("unknown");
  });
});
