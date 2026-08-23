import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { freshDb, single } from "./helpers";

type Tx = Parameters<Parameters<PGlite["transaction"]>[0]>[0];

function asTenant<T>(
  pg: PGlite,
  academyId: string,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  return pg.transaction(async (tx) => {
    await tx.query("SET LOCAL ROLE matops_app");
    await tx.query("SELECT set_config('app.academy_id', $1, true)", [
      academyId,
    ]);
    return run(tx);
  });
}

describe("RLS — notification center", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
    await pg.exec(`
      INSERT INTO notification (academy_id, user_id, kind, title, body, link)
      VALUES
        ('academy_A', 'user_shared', 'announcement', 'A news', 'body', '/'),
        ('academy_B', 'user_shared', 'announcement', 'B news', 'body', '/');
    `);
  });

  afterAll(async () => {
    await pg.close();
  });

  it("shows a member of two academies only the active one's feed", async () => {
    const seen = await asTenant(pg, "academy_A", async (tx) =>
      (
        await tx.query<{ title: string }>("SELECT title FROM notification")
      ).rows.map((r) => r.title),
    );
    expect(seen).toEqual(["A news"]);
  });

  it("rejects writing a row into another academy", async () => {
    await expect(
      asTenant(pg, "academy_A", (tx) =>
        tx.query(`
          INSERT INTO notification (academy_id, user_id, kind, title, body)
          VALUES ('academy_B', 'sneak', 'announcement', 'leak', 'body')
        `),
      ),
    ).rejects.toThrow();
  });

  it("cannot mark another academy's notification read", async () => {
    const updated = await asTenant(
      pg,
      "academy_A",
      async (tx) =>
        (
          await tx.query(
            "UPDATE notification SET read_at = now() WHERE user_id = 'user_shared' RETURNING id",
          )
        ).rows.length,
    );
    expect(updated).toBe(1);

    const stillUnread = await asTenant(
      pg,
      "academy_B",
      async (tx) =>
        single(
          await tx.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM notification WHERE read_at IS NULL",
          ),
        ).n,
    );
    expect(stillUnread).toBe(1);
  });
});
