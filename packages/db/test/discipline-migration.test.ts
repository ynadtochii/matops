import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

type Tx = Parameters<Parameters<PGlite["transaction"]>[0]>[0];

const migrations = path.join(import.meta.dirname, "..", "migrations");
const A = "discipline_a";
const B = "discipline_b";

async function scoped<T>(
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

describe("academy discipline migration", () => {
  let pg: PGlite;
  let snapshot: Blob;

  beforeAll(async () => {
    const prepared = new PGlite();
    for (const file of [
      "0000_baseline.sql",
      "0001_reception_link.sql",
      "0002_loose_machine_man.sql",
      "0003_nebulous_magus.sql",
      "0004_first_release_drops.sql",
    ]) {
      await prepared.exec(
        readFileSync(path.join(migrations, file), "utf8").replaceAll(
          "--> statement-breakpoint",
          "",
        ),
      );
    }
    for (const academyId of [A, B]) {
      await prepared.query(
        `INSERT INTO "organization" (id, name, slug, created_at) VALUES ($1, $1, $1, now())`,
        [academyId],
      );
      await prepared.query(
        `INSERT INTO "entity" (id, organization_id, type, name, slug, public_code) VALUES ($1, $1, 'bjj_academy', $1, $1, $2)`,
        [academyId, academyId === A ? "432100" : "432101"],
      );
    }
    await prepared.query(
      `INSERT INTO "class_template" (academy_id, title, discipline, days_of_week, starts_at_minutes, duration_minutes, time_zone, capacity) VALUES ($1, 'Legacy', 'bjj', '{1}', 600, 60, 'UTC', 20)`,
      [A],
    );
    await prepared.query(
      `INSERT INTO "class" (academy_id, title, discipline, starts_at, duration_minutes, capacity) VALUES ($1, 'Legacy', 'nogi', now() - interval '3 days', 60, 20)`,
      [A],
    );
    await prepared.exec(
      readFileSync(
        path.join(migrations, "0005_academy_disciplines.sql"),
        "utf8",
      ).replaceAll("--> statement-breakpoint", ""),
    );
    snapshot = await prepared.dumpDataDir("gzip");
    await prepared.close();
  });

  beforeEach(() => {
    pg = new PGlite({ loadDataDir: snapshot });
  });

  afterEach(async () => pg.close());

  it("keeps old class labels and clears old template labels without catalog seeds", async () => {
    expect(
      (
        await pg.query<{ discipline: string }>(
          `SELECT discipline FROM "class" WHERE academy_id = $1`,
          [A],
        )
      ).rows[0]?.discipline,
    ).toBe("nogi");
    expect(
      (
        await pg.query<{ discipline: string | null }>(
          `SELECT discipline FROM "class_template" WHERE academy_id = $1`,
          [A],
        )
      ).rows[0]?.discipline,
    ).toBeNull();
    expect(
      (await pg.query<{ id: string }>(`SELECT id FROM "academy_discipline"`))
        .rows,
    ).toEqual([]);
    expect(
      (
        await pg.query<{ type: string }>(
          `SELECT data_type AS type FROM information_schema.columns WHERE table_name = 'class' AND column_name = 'discipline'`,
        )
      ).rows[0]?.type,
    ).toBe("text");
  });

  it("enforces case-insensitive uniqueness per academy", async () => {
    await pg.query(
      `INSERT INTO "academy_discipline" (academy_id, name) VALUES ($1, 'Judo')`,
      [A],
    );
    await expect(
      pg.query(
        `INSERT INTO "academy_discipline" (academy_id, name) VALUES ($1, 'jUdO')`,
        [A],
      ),
    ).rejects.toThrow();
    await pg.query(
      `INSERT INTO "academy_discipline" (academy_id, name) VALUES ($1, 'judo')`,
      [B],
    );
  });

  it("only grants tenant access to rows for the active academy", async () => {
    await pg.query(
      `INSERT INTO "academy_discipline" (academy_id, name) VALUES ($1, 'Judo')`,
      [A],
    );
    await pg.query(
      `INSERT INTO "academy_discipline" (academy_id, name) VALUES ($1, 'judo')`,
      [B],
    );
    const own = await scoped(pg, A, (tx) =>
      tx.query<{ name: string }>(`SELECT name FROM "academy_discipline"`),
    );
    expect(own.rows.map((row) => row.name)).toEqual(["Judo"]);
    await expect(
      scoped(pg, A, (tx) =>
        tx.query(
          `INSERT INTO "academy_discipline" (academy_id, name) VALUES ($1, 'Foreign')`,
          [B],
        ),
      ),
    ).rejects.toThrow();
    const untouched = await scoped(pg, A, (tx) =>
      tx.query(
        `UPDATE "academy_discipline" SET name = 'Foreign' WHERE academy_id = $1 RETURNING id`,
        [B],
      ),
    );
    expect(untouched.rows).toEqual([]);
    const hidden = await pg.transaction(async (tx) => {
      await tx.query("SET LOCAL ROLE matops_app");
      return tx.query(`SELECT id FROM "academy_discipline"`);
    });
    expect(hidden.rows).toEqual([]);
  });
});
