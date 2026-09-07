import { describe, expect, it } from "vitest";

import { purchaseActivationIssue } from "../src/membership-purchase";

const eligible = {
  startMonth: "2026-09-01",
  currentMonth: "2026-09-01",
  quotedVersion: "same",
  currentVersion: "same",
  unavailableReason: null,
  restriction: null,
};

describe("purchaseActivationIssue", () => {
  it("allows confirmed current and future purchases with unchanged terms", () => {
    expect(purchaseActivationIssue(eligible)).toBeNull();
    expect(
      purchaseActivationIssue({ ...eligible, startMonth: "2026-10-01" }),
    ).toBeNull();
  });

  it("refuses an expired purchase even if the next month has renewal grace", () => {
    expect(
      purchaseActivationIssue({ ...eligible, currentMonth: "2026-10-01" }),
    ).toContain("month has ended");
  });

  it("refuses changed quotes even when the student already paid", () => {
    expect(
      purchaseActivationIssue({ ...eligible, currentVersion: "changed" }),
    ).toContain("terms changed");
  });

  it("preserves branch restrictions and unavailable plans", () => {
    expect(
      purchaseActivationIssue({ ...eligible, restriction: "Suspended at Gym" }),
    ).toBe("Suspended at Gym");
    expect(
      purchaseActivationIssue({
        ...eligible,
        unavailableReason: "Plan archived",
      }),
    ).toBe("Plan archived");
  });
});
