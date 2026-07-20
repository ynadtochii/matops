import { describe, expect, it } from "vitest";

import { freshDb, single } from "./helpers";

// Slice 0.2 verification: the migration applies, and the DB round-trips a write.
describe("db pipeline (_health)", () => {
  it("applies migrations, then writes and reads a health row", async () => {
    const pg = await freshDb();
    await pg.query(`INSERT INTO "_health" (note) VALUES ('vitest')`);
    const res = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "_health"`,
    );
    expect(single(res).n).toBe(1);
    await pg.close();
  });
});
