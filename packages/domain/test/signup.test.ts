import { describe, expect, it } from "vitest";

import {
  SIGNUP_FOR_CHILD,
  SIGNUP_NEVER_TRAINED,
  signupWrites,
  waiverTemplate,
} from "../src/signup";

describe("signupWrites", () => {
  it("writes the student's belt, health note and email opt-in", () => {
    expect(
      signupWrites({
        role: "student",
        healthQuestion: true,
        requiredWaiverId: null,
        answers: {
          belt: "Blue",
          stripes: 2,
          health: "  Left knee, no heel hooks  ",
          emailUpdates: true,
        },
      }),
    ).toEqual({
      ok: true,
      writes: {
        rank: { discipline: "bjj", belt: "Blue", stripes: 2 },
        notes: ["Left knee, no heel hooks"],
        emailUpdates: true,
        waiverId: null,
      },
    });
  });

  it("defaults stripes to zero", () => {
    const result = signupWrites({
      role: "student",
      healthQuestion: false,
      requiredWaiverId: null,
      answers: { belt: "White" },
    });
    expect(result).toMatchObject({
      ok: true,
      writes: { rank: { belt: "White", stripes: 0 } },
    });
  });

  it("rejects a belt or stripe count outside the ladder", () => {
    expect(
      signupWrites({
        role: "student",
        healthQuestion: false,
        requiredWaiverId: null,
        answers: { belt: "Red" },
      }),
    ).toMatchObject({ ok: false });
    expect(
      signupWrites({
        role: "student",
        healthQuestion: false,
        requiredWaiverId: null,
        answers: { belt: "Blue", stripes: 5 },
      }),
    ).toMatchObject({ ok: false });
  });

  it("saves a newcomer as White with no stripes and a note", () => {
    expect(
      signupWrites({
        role: "student",
        healthQuestion: true,
        requiredWaiverId: null,
        answers: { belt: SIGNUP_NEVER_TRAINED, stripes: 3, health: "Asthma" },
      }),
    ).toMatchObject({
      ok: true,
      writes: {
        rank: { discipline: "bjj", belt: "White", stripes: 0 },
        notes: ["Never trained before", "Asthma"],
      },
    });
  });

  it("saves a parent asking for a child with no rank and a note", () => {
    expect(
      signupWrites({
        role: "student",
        healthQuestion: false,
        requiredWaiverId: null,
        answers: { belt: SIGNUP_FOR_CHILD },
      }),
    ).toMatchObject({
      ok: true,
      writes: { rank: null, notes: ["Enquiring for a child"] },
    });
  });

  it("writes no rank when the belt is missing", () => {
    expect(
      signupWrites({
        role: "student",
        healthQuestion: false,
        requiredWaiverId: null,
        answers: {},
      }),
    ).toEqual({
      ok: true,
      writes: {
        rank: null,
        notes: [],
        emailUpdates: false,
        waiverId: null,
      },
    });
  });

  it("drops the health answer when the academy does not ask", () => {
    expect(
      signupWrites({
        role: "student",
        healthQuestion: false,
        requiredWaiverId: null,
        answers: { belt: "White", health: "Asthma" },
      }),
    ).toMatchObject({ ok: true, writes: { notes: [] } });
  });

  it("drops a blank health answer", () => {
    expect(
      signupWrites({
        role: "student",
        healthQuestion: true,
        requiredWaiverId: null,
        answers: { belt: "White", health: "   " },
      }),
    ).toMatchObject({ ok: true, writes: { notes: [] } });
  });

  it("writes nothing for a non-student role", () => {
    expect(
      signupWrites({
        role: "instructor",
        healthQuestion: true,
        requiredWaiverId: null,
        answers: {
          belt: "Red",
          health: "Asthma",
          emailUpdates: true,
        },
      }),
    ).toEqual({
      ok: true,
      writes: {
        rank: null,
        notes: [],
        emailUpdates: false,
        waiverId: null,
      },
    });
  });

  it("records the current agreement the student accepted", () => {
    expect(
      signupWrites({
        role: "student",
        healthQuestion: false,
        requiredWaiverId: "w2",
        answers: { belt: "White", waiverId: "w2" },
      }),
    ).toMatchObject({ ok: true, writes: { waiverId: "w2" } });
  });

  it("refuses a join without the required agreement", () => {
    expect(
      signupWrites({
        role: "student",
        healthQuestion: false,
        requiredWaiverId: "w2",
        answers: { belt: "White" },
      }),
    ).toEqual({ ok: false, message: "Read and accept the agreement to join." });
  });

  it("refuses an agreement the owner has since edited", () => {
    expect(
      signupWrites({
        role: "student",
        healthQuestion: false,
        requiredWaiverId: "w2",
        answers: { belt: "White", waiverId: "w1" },
      }),
    ).toEqual({
      ok: false,
      message: "The agreement changed. Please read it again.",
    });
  });

  it("ignores an agreement id while none is required", () => {
    expect(
      signupWrites({
        role: "student",
        healthQuestion: false,
        requiredWaiverId: null,
        answers: { belt: "White", waiverId: "w1" },
      }),
    ).toMatchObject({ ok: true, writes: { waiverId: null } });
  });

  it("never asks an instructor for the agreement", () => {
    expect(
      signupWrites({
        role: "instructor",
        healthQuestion: false,
        requiredWaiverId: "w2",
        answers: {},
      }),
    ).toMatchObject({ ok: true, writes: { waiverId: null } });
  });
});

describe("waiverTemplate", () => {
  it("names the academy", () => {
    expect(waiverTemplate("Alma")).toContain("Alma and its coaches");
  });
});
