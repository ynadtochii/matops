import { describe, expect, it } from "vitest";

import {
  ENTITY_TYPES,
  isBjjAcademy,
  isGeneralSpace,
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

  it("treats a gym and a sauna as one general type, not two", () => {
    expect(isSupportedEntityType("general_space")).toBe(true);
    expect(isGeneralSpace("general_space")).toBe(true);
    expect(isGeneralSpace("gym")).toBe(false);
    expect(isGeneralSpace("sauna")).toBe(false);
  });

  it("refuses a near miss rather than guessing", () => {
    expect(isSupportedEntityType("BJJ_ACADEMY")).toBe(false);
    expect(isSupportedEntityType("bjj-academy")).toBe(false);
    expect(isSupportedEntityType(" bjj_academy")).toBe(false);
  });

  it("knows which type gets the BJJ screens", () => {
    expect(isBjjAcademy("bjj_academy")).toBe(true);
    expect(isBjjAcademy("general_space")).toBe(false);
    expect(isBjjAcademy("sauna")).toBe(false);
  });

  it("keeps the two predicates apart", () => {
    for (const type of ENTITY_TYPES) {
      expect([type, isBjjAcademy(type) !== isGeneralSpace(type)]).toEqual([
        type,
        true,
      ]);
    }
  });

  it("ships exactly the two types the plan names", () => {
    expect([...ENTITY_TYPES]).toEqual(["bjj_academy", "general_space"]);
  });
});
