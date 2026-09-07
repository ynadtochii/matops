import { describe, expect, it } from "vitest";

import { csvDocument, parseCsv } from "../src/csv";

describe("student CSV", () => {
  it("parses quoted fields, newlines, escaped quotes, and a byte-order mark", () => {
    expect(
      parseCsv('\ufeffname,email\r\n"Silva, ""Ana""","ana\n@example.com"\r\n'),
    ).toEqual([
      ["name", "email"],
      ['Silva, "Ana"', "ana\n@example.com"],
    ]);
  });

  it("rejects an unclosed quoted field", () => {
    expect(() => parseCsv('name\n"Ana')).toThrow("unclosed quoted field");
  });

  it("writes safe spreadsheet fields", () => {
    expect(csvDocument(["name"], [["=HYPERLINK(1)"]])).toBe(
      'name\r\n"\'=HYPERLINK(1)"\r\n',
    );
  });
});
