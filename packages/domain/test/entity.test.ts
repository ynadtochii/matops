import { describe, expect, it } from "vitest";

import {
  ENTITY_TYPES,
  isBjjAcademy,
  isSupportedEntityType,
} from "../src/entity";

describe("entity types", () => {
  it("accepts every type in the list", () => {
    for (const type of ENTITY_TYPES) {
      expect(isSupportedEntityType(type)).toBe(true);
    }
  });

  it("refuses a type nobody implemented", () => {
    expect(isSupportedEntityType("sauna")).toBe(false);
    expect(isSupportedEntityType("gym")).toBe(false);
    expect(isSupportedEntityType("")).toBe(false);
  });

  it("refuses a near miss rather than guessing", () => {
    expect(isSupportedEntityType("BJJ_ACADEMY")).toBe(false);
    expect(isSupportedEntityType("bjj-academy")).toBe(false);
    expect(isSupportedEntityType(" bjj_academy")).toBe(false);
  });

  it("knows which type gets the BJJ screens", () => {
    expect(isBjjAcademy("bjj_academy")).toBe(true);
    expect(isBjjAcademy("sauna")).toBe(false);
  });

  it("ships exactly one type during this pivot", () => {
    expect([...ENTITY_TYPES]).toEqual(["bjj_academy"]);
  });
});
