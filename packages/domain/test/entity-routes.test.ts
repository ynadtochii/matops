import { describe, expect, it } from "vitest";

import {
  canVisit,
  entityFromPath,
  entityHref,
  pathWithinEntity,
} from "../src/entity";

describe("entity routes", () => {
  it("reads the entity out of the path", () => {
    expect(entityFromPath("/entities/acad_a")).toBe("acad_a");
    expect(entityFromPath("/entities/acad_a/schedule")).toBe("acad_a");
  });

  it("has no entity outside the prefix", () => {
    expect(entityFromPath("/overview")).toBeNull();
    expect(entityFromPath("/entities")).toBeNull();
    expect(entityFromPath("/entitiesx/acad_a")).toBeNull();
  });

  it("survives an id that needed escaping", () => {
    const id = "acad a/b";
    expect(entityFromPath(entityHref(id, "/members"))).toBe(id);
  });

  it("builds the home path without a trailing slash", () => {
    expect(entityHref("acad_a")).toBe("/entities/acad_a");
    expect(entityHref("acad_a", "/members")).toBe("/entities/acad_a/members");
  });

  it("strips the entity for the route table", () => {
    expect(pathWithinEntity("/entities/acad_a")).toBe("/");
    expect(pathWithinEntity("/entities/acad_a/members")).toBe("/members");
    expect(pathWithinEntity("/entities/acad_a/class/1")).toBe("/class/1");
  });

  it("strips an escaped id by what the URL holds, not by its length", () => {
    expect(pathWithinEntity(entityHref("acad a/b", "/members"))).toBe(
      "/members",
    );
  });

  it("leaves an organization path alone", () => {
    expect(pathWithinEntity("/overview")).toBe("/overview");
    expect(pathWithinEntity("/profile")).toBe("/profile");
  });
});

describe("who may open which screen", () => {
  const owner = { role: "owner", status: "active" };
  const coach = { role: "instructor", status: "active" };
  const student = { role: "student", status: "active" };
  const pending = { role: "member", status: "pending" };

  it("reads the path after the entity segment", () => {
    expect(canVisit("/entities/acad_a/settings", owner)).toBe(true);
    expect(canVisit("/entities/acad_a/settings", coach)).toBe(false);
  });

  it("gives the same answer for an entity-relative path", () => {
    expect(canVisit("/settings", owner)).toBe(true);
    expect(canVisit("/settings", coach)).toBe(false);
  });

  it("keeps staff screens off a student", () => {
    for (const path of ["/members", "/schedule", "/coaches", "/attendance"]) {
      expect([path, canVisit(path, student)]).toEqual([path, false]);
      expect([path, canVisit(path, coach)]).toEqual([path, true]);
    }
  });

  it("leaves the shared screens open", () => {
    for (const path of [
      "/",
      "/payments",
      "/profile",
      "/training",
      "/class/1",
    ]) {
      expect([path, canVisit(path, pending)]).toEqual([path, true]);
    }
  });

  it("shows nothing at all for a type this build does not know", () => {
    for (const path of ["/", "/schedule", "/members", "/payments"]) {
      expect([path, canVisit(path, { ...owner, type: "sauna" })]).toEqual([
        path,
        false,
      ]);
    }
  });

  it("runs a general space on the same screens minus the BJJ ones", () => {
    const gym = { ...owner, type: "general_space" };
    for (const path of ["/", "/schedule", "/members", "/attendance"]) {
      expect([path, canVisit(path, gym)]).toEqual([path, true]);
    }
    expect(canVisit("/entities/acad_a/settings", gym)).toBe(true);
    expect(canVisit("/entities/acad_a/referrals", gym)).toBe(false);
  });

  it("keeps referrals for a BJJ academy", () => {
    const mat = { ...owner, type: "bjj_academy" };
    expect(canVisit("/entities/acad_a/schedule", mat)).toBe(true);
    expect(canVisit("/entities/acad_a/referrals", mat)).toBe(true);
  });

  it("keeps the role check on a general space", () => {
    const gymCoach = { ...coach, type: "general_space" };
    expect(canVisit("/settings", gymCoach)).toBe(false);
    expect(canVisit("/schedule", gymCoach)).toBe(true);
    expect(canVisit("/members", { ...student, type: "general_space" })).toBe(
      false,
    );
  });
});
