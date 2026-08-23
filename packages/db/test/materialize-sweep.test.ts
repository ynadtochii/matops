import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MATERIALIZATION_HORIZON_DAYS } from "@matops/domain";

import { runMaterializationSweep } from "../src/materialize";
import { execOn, freshDb, single } from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

const COLS =
  "(academy_id, instructor_id, title, days_of_week, starts_at_minutes, duration_minutes, time_zone, capacity, status)";

const template = (academyId: string, title: string, status = "active") =>
  `('${academyId}', 'user_1', '${title}', '{0,1,2,3,4,5,6}', 600, 60, 'UTC', 20, '${status}')`;

/**
 * The horizon sweep (docs/issues/16, 46). This is the ONLY thing that extends a
 * gym's calendar once its owner stops editing templates, so it needs its own net:
 * the schedule read does not heal the horizon, and a gym whose classes run out
 * has no bookable week. Runs on PGlite through the injected executor.
 */
describe("materialization sweep", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await freshDb();
  });

  afterAll(() => pg.close());

  beforeEach(async () => {
    await pg.exec(`DELETE FROM "class"; DELETE FROM "class_template";`);
  });

  const exec = () => execOn(pg);

  const classCount = (): Promise<number> =>
    pg
      .query<{ n: number }>(`SELECT count(*)::int AS n FROM "class"`)
      .then((res) => single(res).n);

  const cursor = (): Promise<string | null> =>
    pg
      .query<{ generated_until: string | null }>(
        `SELECT generated_until FROM "class_template" LIMIT 1`,
      )
      .then((res) => single(res).generated_until);

  it("fills a template that was never materialized", async () => {
    await pg.exec(
      `INSERT INTO "class_template" ${COLS} VALUES ${template("acad_a", "Gi Fundamentals")}`,
    );

    const res = await runMaterializationSweep({ exec: exec() });

    expect(res.processed).toBe(1);
    expect(res.created).toBeGreaterThan(0);
    expect(await classCount()).toBe(res.created);
  });

  it("advances the cursor to the horizon, so a stale gym catches up", async () => {
    await pg.exec(
      `INSERT INTO "class_template" ${COLS} VALUES ${template("acad_a", "Gi Fundamentals")}`,
    );
    const now = new Date();
    await runMaterializationSweep({ exec: exec(), now });

    const reached = new Date((await cursor()) ?? 0);
    const horizon = new Date(
      now.getTime() + MATERIALIZATION_HORIZON_DAYS * DAY_MS,
    );
    expect(reached.getTime()).toBeGreaterThanOrEqual(
      horizon.getTime() - DAY_MS,
    );
  });

  it("is idempotent — a second run creates nothing", async () => {
    await pg.exec(
      `INSERT INTO "class_template" ${COLS} VALUES ${template("acad_a", "Gi Fundamentals")}`,
    );
    await runMaterializationSweep({ exec: exec() });
    const after = await classCount();

    const second = await runMaterializationSweep({ exec: exec() });

    expect(second.created).toBe(0);
    expect(await classCount()).toBe(after);
  });

  it("leaves a paused template alone", async () => {
    await pg.exec(
      `INSERT INTO "class_template" ${COLS} VALUES ${template("acad_a", "On hold", "paused")}`,
    );

    const res = await runMaterializationSweep({ exec: exec() });

    expect(res.processed).toBe(0);
    expect(await classCount()).toBe(0);
  });

  it("reports hasMore when the row limit stops it, so the next tick resumes", async () => {
    await pg.exec(
      `INSERT INTO "class_template" ${COLS} VALUES
         ${template("acad_a", "One")},
         ${template("acad_b", "Two")}`,
    );

    const res = await runMaterializationSweep({ exec: exec(), limit: 1 });

    expect(res.processed).toBe(1);
    expect(res.hasMore).toBe(true);
  });
});
