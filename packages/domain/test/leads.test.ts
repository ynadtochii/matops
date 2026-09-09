import { describe, expect, it } from "vitest";

import type { LeadRow } from "../src/leads";
import {
  canPromoteLead,
  leadFunnel,
  leadQueues,
  matchLeadByPhone,
  needsFollowUp,
  phoneMatchKey,
} from "../src/leads";

const lead = (
  stage: LeadRow["stage"],
  activity: Partial<LeadRow["activity"]> = {},
): LeadRow => ({
  stage,
  activity: {
    visits: 0,
    lastVisitAt: null,
    nextBookingAt: null,
    ...activity,
  },
});

describe("phoneMatchKey", () => {
  it("collapses formatting and the country code to the same key", () => {
    expect(phoneMatchKey("+351 912 345 678")).toBe(phoneMatchKey("912345678"));
  });

  it("keeps the last nine digits of a longer number", () => {
    expect(phoneMatchKey("00351912345678")).toBe("912345678");
  });

  it("returns a short number unchanged", () => {
    expect(phoneMatchKey("55512")).toBe("55512");
  });
});

describe("matchLeadByPhone", () => {
  it("finds the lead behind a differently written number", () => {
    const leads = [{ phone: "351912345678" }, { phone: "351911111111" }];
    expect(matchLeadByPhone(leads, "+351 912 345 678")).toEqual({
      phone: "351912345678",
    });
  });

  it("returns nothing when two leads end in the same nine digits", () => {
    const leads = [{ phone: "351912345678" }, { phone: "1912345678" }];
    expect(matchLeadByPhone(leads, "912345678")).toBeNull();
  });

  it("refuses to match on a number too short to identify anyone", () => {
    expect(matchLeadByPhone([{ phone: "12345" }], "12345")).toBeNull();
  });

  it("returns nothing when no lead matches", () => {
    expect(
      matchLeadByPhone([{ phone: "351911111111" }], "912345678"),
    ).toBeNull();
  });
});

describe("needsFollowUp", () => {
  it("holds a person who trained and was never followed up", () => {
    expect(needsFollowUp(lead("new", { visits: 2 }))).toBe(true);
  });

  it("holds a person the owner spoke to but who has not joined", () => {
    expect(needsFollowUp(lead("contacted", { visits: 1 }))).toBe(true);
  });

  it("drops a member", () => {
    expect(needsFollowUp(lead("joined", { visits: 3 }))).toBe(false);
  });

  it("drops a ghosted lead", () => {
    expect(needsFollowUp(lead("ghosted", { visits: 3 }))).toBe(false);
  });

  it("drops someone who booked but never turned up", () => {
    expect(needsFollowUp(lead("new", { nextBookingAt: new Date() }))).toBe(
      false,
    );
  });
});

describe("leadQueues", () => {
  it("counts the two queue items and both can reach zero", () => {
    const leads = [
      lead("new"),
      lead("new", { visits: 1 }),
      lead("contacted", { visits: 2 }),
      lead("joined", { visits: 4 }),
      lead("ghosted", { visits: 1 }),
    ];
    expect(leadQueues(leads)).toEqual({ newLeads: 2, trainedNotJoined: 2 });
    expect(leadQueues([lead("joined"), lead("ghosted")])).toEqual({
      newLeads: 0,
      trainedNotJoined: 0,
    });
  });
});

describe("leadFunnel", () => {
  it("counts created, booked, trained and joined", () => {
    const leads = [
      lead("new", { nextBookingAt: new Date() }),
      lead("contacted", { visits: 1 }),
      lead("joined", { visits: 2 }),
      lead("ghosted"),
    ];
    expect(leadFunnel(leads)).toEqual({
      created: 4,
      booked: 1,
      trained: 2,
      joined: 1,
    });
  });
});
describe("canPromoteLead", () => {
  const promotable = {
    stage: "contacted" as const,
    email: "pat@example.com",
    consent: true,
  };

  it("promotes a lead who gave an email and agreed to be contacted", () => {
    expect(canPromoteLead(promotable)).toEqual({ ok: true });
  });

  it("refuses a lead with no email, because there is no account to make", () => {
    expect(canPromoteLead({ ...promotable, email: null })).toEqual({
      ok: false,
      reason: "no-email",
    });
  });

  it("refuses a front-desk visitor, who never agreed to be contacted", () => {
    expect(canPromoteLead({ ...promotable, consent: false })).toEqual({
      ok: false,
      reason: "no-consent",
    });
  });

  it("refuses a lead who is already a member", () => {
    expect(canPromoteLead({ ...promotable, stage: "joined" })).toEqual({
      ok: false,
      reason: "already-joined",
    });
  });

  it("names the missing agreement before the missing email", () => {
    expect(
      canPromoteLead({ ...promotable, email: null, consent: false }),
    ).toEqual({ ok: false, reason: "no-consent" });
  });
});
