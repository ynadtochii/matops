import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  fileURLToPath(
    new URL(
      "../scripts/2026-09-07-legacy-dues-to-shared-memberships.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("legacy dues conversion", () => {
  it("rolls back unless apply is true", () => {
    expect(sql).toContain("\\set apply false");
    expect(sql).toContain("\\if :apply");
    expect(sql).toContain("COMMIT;");
    expect(sql).toContain("ROLLBACK;");
  });

  it("preserves every legacy claim state", () => {
    expect(sql).toContain("'legacy-dues-v1:' || c.status::text");
    expect(sql).toContain("WHEN c.status = 'confirmed' THEN 'confirmed'");
    expect(sql).toContain("WHEN c.status = 'pending' THEN 'claimed'");
    expect(sql).toContain("ELSE 'rejected'");
  });

  it("refuses to clear claims that were not preserved", () => {
    expect(sql).toContain("WHERE p.id IS NULL");
    expect(sql).toContain("Not every legacy claim was preserved");
  });
});
