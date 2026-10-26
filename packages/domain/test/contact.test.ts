import { describe, expect, it } from "vitest";

import { CONTACT_EMAIL, feedbackMailto } from "../src/contact";

describe("feedbackMailto", () => {
  it("names the academy, its id, the role and the screen", () => {
    const href = feedbackMailto({
      academy: { name: "Pilot BJJ", academyId: "a1", role: "student" },
      screen: "app/profile",
    });
    expect(href.startsWith(`mailto:${CONTACT_EMAIL}?subject=`)).toBe(true);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("subject")).toBe("MatOps feedback: Pilot BJJ");
    expect(params.get("body")).toContain(
      "Academy: Pilot BJJ (a1)\nRole: student\n",
    );
    expect(params.get("body")).toContain("Screen: app/profile");
  });

  it("falls back to the gym when no academy is named", () => {
    const href = feedbackMailto({ academy: null, screen: "/" });
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("subject")).toBe("MatOps feedback: the gym");
    expect(params.get("body")).not.toContain("Academy:");
  });
});
