import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addDays,
  daysBetween,
  MAX_SLOT_BLOCKS,
  mondayOf,
} from "@matops/domain";

import type { Harness } from "./helpers";
import { harness, rejectionCode, seedAcademies, seedClasses } from "./helpers";

const ACAD = "acad_curr";
const OTHER = "acad_curr_other";
const OWNER = "u_curr_owner";
const COACH = "u_curr_coach";
const STUDENT = "u_curr_student";
const OTHER_OWNER = "u_curr_other_owner";

describe("curriculum blocks and the plan", () => {
  let h: Harness;
  let mainTrack = "";

  beforeAll(async () => {
    h = await harness();
    await seedAcademies(h.pg, [
      {
        id: ACAD,
        code: "700120",
        members: [
          { userId: OWNER, role: "owner", status: "active" },
          { userId: COACH, role: "instructor", status: "active" },
          { userId: STUDENT, role: "student", status: "active" },
        ],
      },
      {
        id: OTHER,
        code: "700121",
        members: [{ userId: OTHER_OWNER, role: "owner", status: "active" }],
      },
    ]);
    mainTrack = (await h.as(OWNER, ACAD).curriculum.board()).activeTrackId;
  });

  afterAll(() => h.close());

  const reset = async () => {
    await h.pg.query(`DELETE FROM curriculum_block`);
    await h.pg.query(`DELETE FROM curriculum_block_template`);
    await h.pg.query(`UPDATE class_template SET curriculum_track_id = NULL`);
    await h.pg.query(`DELETE FROM curriculum_track WHERE NOT is_default`);
  };

  const block = (theme: string, defaultWeeks = 2, category?: string) =>
    h.as(OWNER, ACAD).curriculum.createBlock({ theme, defaultWeeks, category });

  const planOf = async (themes: string[], weeks = 2) => {
    const ids: string[] = [];
    for (const theme of themes) {
      const made = await block(theme, weeks);
      await h.as(OWNER, ACAD).curriculum.place({
        trackId: mainTrack,
        blockId: made.id,
        atIndex: 500,
      });
      ids.push(made.id);
    }
    return ids;
  };

  it("keeps the library and the plan apart", async () => {
    await reset();
    const made = await block("Closed guard", 3);

    const before = await h.as(OWNER, ACAD).curriculum.board();
    expect(before.blocks.map((b) => [b.theme, b.defaultWeeks, b.used])).toEqual(
      [["Closed guard", 3, 0]],
    );
    expect(before.plan).toHaveLength(0);

    await h
      .as(OWNER, ACAD)
      .curriculum.place({ trackId: mainTrack, blockId: made.id, atIndex: 0 });
    const after = await h.as(OWNER, ACAD).curriculum.board();
    expect(after.blocks[0]?.used).toBe(1);
    expect(after.plan[0]?.themes[0]?.theme).toBe("Closed guard");
    expect(after.plan[0]?.weeks).toBe(3);
    expect(after.plan[0]?.startsOn).toBe(mondayOf(after.today));
    expect(after.plan[0]?.state).toBe("running");
  });

  it("places one block twice, and counts both uses", async () => {
    await reset();
    const made = await block("Closed guard", 1);
    await h
      .as(OWNER, ACAD)
      .curriculum.place({ trackId: mainTrack, blockId: made.id, atIndex: 0 });
    await h
      .as(OWNER, ACAD)
      .curriculum.place({ trackId: mainTrack, blockId: made.id, atIndex: 9 });

    const board = await h.as(OWNER, ACAD).curriculum.board();
    expect(board.blocks).toHaveLength(1);
    expect(board.blocks[0]?.used).toBe(2);
    expect(board.plan.map((p) => p.themes[0]?.theme)).toEqual([
      "Closed guard",
      "Closed guard",
    ]);
    expect(board.plan[1]?.startsOn).toBe(
      addDays(board.plan[0]?.endsOn ?? "", 1),
    );
  });

  it("chains the plan end to end and pushes later blocks when one is extended", async () => {
    await reset();
    await planOf(["A", "B", "C"]);

    const before = await h.as(OWNER, ACAD).curriculum.board();
    expect(
      daysBetween(before.plan[0]?.startsOn ?? "", before.plan[0]?.endsOn ?? ""),
    ).toBe(13);
    expect(before.plan[1]?.startsOn).toBe(
      addDays(before.plan[0]?.endsOn ?? "", 1),
    );

    const result = await h
      .as(COACH, ACAD)
      .curriculum.resize({ slotId: before.plan[0]?.id ?? "", weeks: 3 });
    expect(result.moved).toBe(2);
    expect(result.previousWeeks).toBe(2);

    const after = await h.as(OWNER, ACAD).curriculum.board();
    expect(after.plan[1]?.startsOn).toBe(
      addDays(before.plan[1]?.startsOn ?? "", 7),
    );
    expect(result.endsOn).toBe(after.plan[2]?.endsOn);
  });

  it("drops a block into the middle and pushes the rest down", async () => {
    await reset();
    await planOf(["A", "B", "C"]);
    const extra = await block("Dropped", 1);

    const before = await h.as(OWNER, ACAD).curriculum.board();
    const result = await h
      .as(COACH, ACAD)
      .curriculum.place({ trackId: mainTrack, blockId: extra.id, atIndex: 2 });
    expect(result.moved).toBe(1);

    const after = await h.as(OWNER, ACAD).curriculum.board();
    expect(after.plan.map((p) => p.themes[0]?.theme)).toEqual([
      "A",
      "B",
      "Dropped",
      "C",
    ]);
    expect(after.plan[2]?.startsOn).toBe(before.plan[2]?.startsOn);
    expect(after.plan[3]?.startsOn).toBe(
      addDays(before.plan[2]?.startsOn ?? "", 7),
    );
  });

  it("moves a draft across several positions and keeps every start day", async () => {
    await reset();
    await planOf(["A", "B", "C", "D"]);

    const before = await h.as(OWNER, ACAD).curriculum.board();
    const result = await h
      .as(OWNER, ACAD)
      .curriculum.move({ slotId: before.plan[3]?.id ?? "", toIndex: 1 });
    expect(result.fromIndex).toBe(3);

    const after = await h.as(OWNER, ACAD).curriculum.board();
    expect(after.plan.map((p) => p.themes[0]?.theme)).toEqual([
      "A",
      "D",
      "B",
      "C",
    ]);
    expect(after.plan.map((p) => p.startsOn)).toEqual(
      before.plan.map((p) => p.startsOn),
    );
  });

  it("takes a block off the plan and closes the gap", async () => {
    await reset();
    await planOf(["A", "B", "C"]);

    const before = await h.as(OWNER, ACAD).curriculum.board();
    await h
      .as(OWNER, ACAD)
      .curriculum.unplace({ slotId: before.plan[1]?.id ?? "" });

    const after = await h.as(OWNER, ACAD).curriculum.board();
    expect(after.plan.map((p) => p.themes[0]?.theme)).toEqual(["A", "C"]);
    expect(after.plan[1]?.startsOn).toBe(before.plan[1]?.startsOn);
    expect(after.blocks.find((b) => b.theme === "B")?.used).toBe(0);
  });

  it("lets the running block be shortened, moved and taken off", async () => {
    await reset();
    await planOf(["A", "B"]);
    const board = await h.as(OWNER, ACAD).curriculum.board();
    const running = board.plan[0]?.id ?? "";
    expect(board.plan[0]?.state).toBe("running");
    expect(board.firstEditableIndex).toBe(0);

    await h.as(OWNER, ACAD).curriculum.resize({ slotId: running, weeks: 1 });
    expect((await h.as(OWNER, ACAD).curriculum.board()).plan[0]?.weeks).toBe(1);

    await h.as(OWNER, ACAD).curriculum.move({ slotId: running, toIndex: 1 });
    expect(
      (await h.as(OWNER, ACAD).curriculum.board()).plan.map(
        (p) => p.themes[0]?.theme,
      ),
    ).toEqual(["B", "A"]);

    await h.as(OWNER, ACAD).curriculum.unplace({ slotId: running });
    expect(
      (await h.as(OWNER, ACAD).curriculum.board()).plan.map(
        (p) => p.themes[0]?.theme,
      ),
    ).toEqual(["B"]);
  });

  it("refuses to drop a block onto a part of the plan that has already run", async () => {
    await reset();
    const made = await block("Last month");
    await h.pg.query(
      `INSERT INTO curriculum_block (academy_id, template_id, track_id, slot_id, starts_on, ends_on, weeks)
       VALUES ($1, $2, $3, gen_random_uuid(), current_date - 30, current_date - 17, 2)`,
      [ACAD, made.id, mainTrack],
    );
    const extra = await block("Dropped");
    expect(
      await rejectionCode(
        h.as(OWNER, ACAD).curriculum.place({
          trackId: mainTrack,
          blockId: extra.id,
          atIndex: 0,
        }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("freezes a block that has already run", async () => {
    await reset();
    const made = await block("Last month");
    await h.pg.query(
      `INSERT INTO curriculum_block (academy_id, template_id, track_id, slot_id, starts_on, ends_on, weeks)
       VALUES ($1, $2, $3, gen_random_uuid(), current_date - 30, current_date - 17, 2)`,
      [ACAD, made.id, mainTrack],
    );
    const board = await h.as(OWNER, ACAD).curriculum.board();
    expect(board.plan[0]?.state).toBe("settled");
    const settled = board.plan[0]?.id ?? "";

    expect(
      await rejectionCode(
        h.as(OWNER, ACAD).curriculum.resize({ slotId: settled, weeks: 4 }),
      ),
    ).toBe("PRECONDITION_FAILED");
    expect(
      await rejectionCode(
        h.as(OWNER, ACAD).curriculum.unplace({ slotId: settled }),
      ),
    ).toBe("PRECONDITION_FAILED");
    expect(
      await rejectionCode(
        h.as(OWNER, ACAD).curriculum.move({ slotId: settled, toIndex: 0 }),
      ),
    ).toBe("PRECONDITION_FAILED");
  });

  it("refuses to delete a block that is on the plan", async () => {
    await reset();
    const made = await block("Closed guard");
    await h
      .as(OWNER, ACAD)
      .curriculum.place({ trackId: mainTrack, blockId: made.id, atIndex: 0 });
    expect(
      await rejectionCode(
        h.as(OWNER, ACAD).curriculum.deleteBlock({ blockId: made.id }),
      ),
    ).toBe("PRECONDITION_FAILED");

    const board = await h.as(OWNER, ACAD).curriculum.board();
    await h
      .as(OWNER, ACAD)
      .curriculum.unplace({ slotId: board.plan[0]?.id ?? "" });
    await h.as(OWNER, ACAD).curriculum.deleteBlock({ blockId: made.id });
    expect((await h.as(OWNER, ACAD).curriculum.board()).blocks).toHaveLength(0);
  });

  it("renaming a block renames it wherever it sits on the plan", async () => {
    await reset();
    const made = await block("Passing", 1);
    await h
      .as(OWNER, ACAD)
      .curriculum.place({ trackId: mainTrack, blockId: made.id, atIndex: 0 });
    await h.as(OWNER, ACAD).curriculum.updateBlock({
      id: made.id,
      theme: "Passing, knee slice",
      defaultWeeks: 2,
    });
    const board = await h.as(OWNER, ACAD).curriculum.board();
    expect(board.plan[0]?.themes[0]?.theme).toBe("Passing, knee slice");
    expect(board.plan[0]?.weeks).toBe(1);
  });

  it("names the block covering a date", async () => {
    await reset();
    const made = await block("Closed guard");
    await h
      .as(OWNER, ACAD)
      .curriculum.place({ trackId: mainTrack, blockId: made.id, atIndex: 0 });
    const board = await h.as(OWNER, ACAD).curriculum.board();

    expect(
      (await h.as(COACH, ACAD).curriculum.forDate({ date: board.today }))
        ?.themes[0]?.theme,
    ).toBe("Closed guard");
    expect(
      await h
        .as(COACH, ACAD)
        .curriculum.forDate({ date: addDays(board.today, 90) }),
    ).toBeNull();
  });

  describe("the theme on a class (ADR 110)", () => {
    const TODAY_CLASS = "33333333-3333-4333-8333-000000000001";
    const setOn = (on: boolean) =>
      h.pg.query(`UPDATE organization SET curriculum_for_students = $1`, [on]);

    const planNow = async () => {
      await reset();
      const made = await block("Arm in chokes", 2);
      await h
        .as(OWNER, ACAD)
        .curriculum.place({ trackId: mainTrack, blockId: made.id, atIndex: 0 });
      await h.as(OWNER, ACAD).curriculum.updateBlock({
        id: made.id,
        theme: "Arm in chokes",
        defaultWeeks: 2,
        notes: "Anakonda, d'Arce",
      });
    };

    beforeAll(async () => {
      await seedClasses(h.pg, [
        {
          id: TODAY_CLASS,
          academyId: ACAD,
          instructorId: OWNER,
          startsInMinutes: 120,
        },
      ]);
    });

    it("gives an instructor the theme and the notes", async () => {
      await planNow();
      expect(
        await h.as(COACH, ACAD).curriculum.forClass({ id: TODAY_CLASS }),
      ).toEqual({
        themes: [
          { theme: "Arm in chokes", notes: "Anakonda, d'Arce", run: null },
        ],
      });
    });

    it("tells a student nothing while the owner has it off", async () => {
      await planNow();
      await setOn(false);
      expect(
        await h.as(STUDENT, ACAD).curriculum.forClass({ id: TODAY_CLASS }),
      ).toBeNull();
    });

    it("gives a student the theme but never the notes once it is on", async () => {
      await planNow();
      await setOn(true);
      expect(
        await h.as(STUDENT, ACAD).curriculum.forClass({ id: TODAY_CLASS }),
      ).toEqual({
        themes: [{ theme: "Arm in chokes", notes: null, run: null }],
      });
      await setOn(false);
    });

    it("gives a class every theme running that week", async () => {
      await planNow();
      const board = await h.as(OWNER, ACAD).curriculum.board();
      const extra = await block("Standing", 2);
      await h.as(OWNER, ACAD).curriculum.place({
        trackId: mainTrack,
        blockId: extra.id,
        atIndex: 0,
        slotId: board.plan[0]?.id ?? "",
      });
      expect(
        await h.as(COACH, ACAD).curriculum.forClass({ id: TODAY_CLASS }),
      ).toEqual({
        themes: [
          { theme: "Arm in chokes", notes: "Anakonda, d'Arce", run: null },
          { theme: "Standing", notes: null, run: null },
        ],
      });
    });

    it("gives staff the run note and never gives it to a student", async () => {
      await planNow();
      const board = await h.as(OWNER, ACAD).curriculum.board();
      await h.as(COACH, ACAD).curriculum.setRunNote({
        placementId: board.plan[0]?.themes[0]?.placementId ?? "",
        note: "Far-side underhook only",
      });
      expect(
        await h.as(COACH, ACAD).curriculum.forClass({ id: TODAY_CLASS }),
      ).toEqual({
        themes: [
          {
            theme: "Arm in chokes",
            notes: "Anakonda, d'Arce",
            run: "Far-side underhook only",
          },
        ],
      });

      await setOn(true);
      expect(
        await h.as(STUDENT, ACAD).curriculum.forClass({ id: TODAY_CLASS }),
      ).toEqual({
        themes: [{ theme: "Arm in chokes", notes: null, run: null }],
      });
      await setOn(false);
    });

    it("returns null for a class no block covers", async () => {
      await reset();
      expect(
        await h.as(COACH, ACAD).curriculum.forClass({ id: TODAY_CLASS }),
      ).toBeNull();
    });
  });

  it("files blocks under categories and reuses a spelling the gym has", async () => {
    await reset();
    await block("Closed guard", 2, "Guard");
    await block("Retention", 2, "guard");
    await block("Knee slice", 2, "Passing");
    await block("Loose one", 2);

    const board = await h.as(OWNER, ACAD).curriculum.board();
    expect(board.categories).toEqual(["Guard", "Passing"]);
    const byTheme = new Map(board.blocks.map((b) => [b.theme, b.category]));
    expect(byTheme.get("Closed guard")).toBe("Guard");
    expect(byTheme.get("Retention")).toBe("Guard");
    expect(byTheme.get("Knee slice")).toBe("Passing");
    expect(byTheme.get("Loose one")).toBeNull();
  });

  it("moves a block between categories, and out of one", async () => {
    await reset();
    const made = await block("Closed guard", 2, "Guard");
    await h.as(COACH, ACAD).curriculum.updateBlock({
      id: made.id,
      theme: "Closed guard",
      defaultWeeks: 2,
      category: "Passing",
    });
    expect(
      (await h.as(OWNER, ACAD).curriculum.board()).blocks[0]?.category,
    ).toBe("Passing");

    await h.as(COACH, ACAD).curriculum.updateBlock({
      id: made.id,
      theme: "Closed guard",
      defaultWeeks: 2,
      category: "",
    });
    const after = await h.as(OWNER, ACAD).curriculum.board();
    expect(after.blocks[0]?.category).toBeNull();
    expect(after.categories).toEqual([]);
  });

  describe("tracks", () => {
    const TPL = "11111111-1111-4111-8111-111111111111";
    const NOGI_CLASS = "22222222-2222-4222-8222-222222222222";

    const trackNamed = async (name: string) => {
      const made = await h.as(COACH, ACAD).curriculum.createTrack({ name });
      return made.id;
    };

    const placeIn = async (trackId: string, theme: string, weeks = 2) => {
      const made = await block(theme, weeks);
      await h
        .as(OWNER, ACAD)
        .curriculum.place({ trackId, blockId: made.id, atIndex: 500 });
      return made.id;
    };

    it("ripples inside one track and leaves the others where they are", async () => {
      await reset();
      const nogi = await trackNamed("No-gi");
      await placeIn(mainTrack, "A");
      await placeIn(mainTrack, "B");
      await placeIn(nogi, "Leg entries");

      const before = await h
        .as(OWNER, ACAD)
        .curriculum.board({ trackId: nogi });
      await h
        .as(OWNER, ACAD)
        .curriculum.resize({ slotId: before.plan[0]?.id ?? "", weeks: 6 });

      const after = await h.as(OWNER, ACAD).curriculum.board({ trackId: nogi });
      expect(after.plan[0]?.weeks).toBe(6);
      const main = await h.as(OWNER, ACAD).curriculum.board();
      expect(main.plan.map((p) => p.themes[0]?.theme)).toEqual(["A", "B"]);
      expect(main.plan.map((p) => p.startsOn)).toEqual([
        main.plan[0]?.startsOn,
        addDays(main.plan[0]?.endsOn ?? "", 1),
      ]);
    });

    it("counts a block used in another track, and refuses to delete it", async () => {
      await reset();
      const nogi = await trackNamed("No-gi");
      const shared = await placeIn(nogi, "Closed guard");

      const main = await h.as(OWNER, ACAD).curriculum.board();
      expect(main.plan).toHaveLength(0);
      const card = main.blocks.find((b) => b.id === shared);
      expect(card?.used).toBe(1);
      expect(card?.tracks).toEqual(["No-gi"]);
      expect(
        await rejectionCode(
          h.as(OWNER, ACAD).curriculum.deleteBlock({ blockId: shared }),
        ),
      ).toBe("PRECONDITION_FAILED");
    });

    it("gives two same-day classes the theme of their own track", async () => {
      await reset();
      const nogi = await trackNamed("No-gi");
      await placeIn(mainTrack, "Closed guard");
      await placeIn(nogi, "Leg entries");
      await h.pg.query(
        `INSERT INTO class_template
           (id, academy_id, instructor_id, title, curriculum_track_id,
            days_of_week, starts_at_minutes, duration_minutes, time_zone, capacity)
         VALUES ($1, $2, $3, 'No-gi', $4, ARRAY[1], 1080, 60, 'UTC', 20)`,
        [TPL, ACAD, OWNER, nogi],
      );
      await seedClasses(h.pg, [
        {
          id: NOGI_CLASS,
          academyId: ACAD,
          instructorId: OWNER,
          startsInMinutes: 120,
        },
      ]);
      await h.pg.query(`UPDATE class SET template_id = $1 WHERE id = $2`, [
        TPL,
        NOGI_CLASS,
      ]);

      expect(
        await h.as(COACH, ACAD).curriculum.forClass({ id: NOGI_CLASS }),
      ).toEqual({ themes: [{ theme: "Leg entries", notes: null, run: null }] });

      await h.pg.query(`UPDATE class_template SET curriculum_track_id = NULL`);
      expect(
        await h.as(COACH, ACAD).curriculum.forClass({ id: NOGI_CLASS }),
      ).toEqual({
        themes: [{ theme: "Closed guard", notes: null, run: null }],
      });

      await h.pg.query(`DELETE FROM class WHERE id = $1`, [NOGI_CLASS]);
      await h.pg.query(`DELETE FROM class_template WHERE id = $1`, [TPL]);
    });

    it("keeps the default track, and sends a deleted track's classes back to it", async () => {
      await reset();
      const nogi = await trackNamed("No-gi");
      expect(
        await rejectionCode(
          h.as(OWNER, ACAD).curriculum.deleteTrack({ id: mainTrack }),
        ),
      ).toBe("PRECONDITION_FAILED");

      await h.pg.query(
        `INSERT INTO class_template
           (id, academy_id, instructor_id, title, curriculum_track_id,
            days_of_week, starts_at_minutes, duration_minutes, time_zone, capacity)
         VALUES ($1, $2, $3, 'No-gi', $4, ARRAY[1], 1080, 60, 'UTC', 20)`,
        [TPL, ACAD, OWNER, nogi],
      );
      const shared = await placeIn(nogi, "Leg entries");
      expect(
        await h.as(COACH, ACAD).curriculum.deleteTrack({ id: nogi }),
      ).toEqual({ detached: 1 });

      const rows = await h.pg.query(
        `SELECT curriculum_track_id FROM class_template WHERE id = $1`,
        [TPL],
      );
      expect(rows.rows[0]).toEqual({ curriculum_track_id: null });
      await h.pg.query(`DELETE FROM class_template WHERE id = $1`, [TPL]);

      const after = await h.as(OWNER, ACAD).curriculum.board();
      expect(after.tracks.map((t) => t.name)).toEqual(["All classes"]);
      expect(after.blocks.find((b) => b.id === shared)?.used).toBe(0);
    });

    it("refuses a student every track write, and hides another gym's tracks", async () => {
      await reset();
      expect(
        await rejectionCode(
          h.as(STUDENT, ACAD).curriculum.createTrack({ name: "Mine" }),
        ),
      ).toBe("FORBIDDEN");
      expect(
        await rejectionCode(
          h.as(OTHER_OWNER, OTHER).curriculum.deleteTrack({ id: mainTrack }),
        ),
      ).toBe("NOT_FOUND");
      const theirs = await h.as(OTHER_OWNER, OTHER).curriculum.board();
      expect(theirs.tracks).toHaveLength(1);
      expect(theirs.activeTrackId).not.toBe(mainTrack);
    });
  });

  it("stays staff-only and never leaks another academy's plan", async () => {
    await reset();
    const made = await block("A");
    await h
      .as(OWNER, ACAD)
      .curriculum.place({ trackId: mainTrack, blockId: made.id, atIndex: 0 });

    expect(await rejectionCode(h.as(STUDENT, ACAD).curriculum.board())).toBe(
      "FORBIDDEN",
    );
    expect(
      await rejectionCode(
        h
          .as(STUDENT, ACAD)
          .curriculum.createBlock({ theme: "Mine", defaultWeeks: 1 }),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await rejectionCode(
        h.as(STUDENT, ACAD).curriculum.place({
          trackId: mainTrack,
          blockId: made.id,
          atIndex: 0,
        }),
      ),
    ).toBe("FORBIDDEN");

    const theirs = await h.as(OTHER_OWNER, OTHER).curriculum.board();
    expect(theirs.blocks).toHaveLength(0);
    expect(theirs.plan).toHaveLength(0);
  });

  describe("the note on one run of a block", () => {
    it("keeps the note on the placement, not on the block", async () => {
      await reset();
      const made = await block("Closed guard", 1);
      await h
        .as(OWNER, ACAD)
        .curriculum.place({ trackId: mainTrack, blockId: made.id, atIndex: 0 });
      await h
        .as(OWNER, ACAD)
        .curriculum.place({ trackId: mainTrack, blockId: made.id, atIndex: 9 });

      const before = await h.as(OWNER, ACAD).curriculum.board();
      await h.as(COACH, ACAD).curriculum.setRunNote({
        placementId: before.plan[0]?.themes[0]?.placementId ?? "",
        note: "Comp team joins from week 2",
      });

      const after = await h.as(OWNER, ACAD).curriculum.board();
      expect(after.plan.map((p) => p.themes[0]?.note)).toEqual([
        "Comp team joins from week 2",
        null,
      ]);
      expect(after.blocks[0]?.notes).toBeNull();
      expect(after.plan.map((p) => p.themes[0]?.theme)).toEqual([
        "Closed guard",
        "Closed guard",
      ]);
    });

    it("takes a note on a stretch that has already run, and clears one", async () => {
      await reset();
      const made = await block("Closed guard", 1);
      await h
        .as(OWNER, ACAD)
        .curriculum.place({ trackId: mainTrack, blockId: made.id, atIndex: 0 });
      const board = await h.as(OWNER, ACAD).curriculum.board();
      const row = board.plan[0]?.themes[0]?.placementId ?? "";
      await h.pg.query(
        `UPDATE curriculum_block
           SET starts_on = starts_on - 60, ends_on = ends_on - 60`,
      );

      const settled = await h.as(OWNER, ACAD).curriculum.board();
      expect(settled.plan[0]?.state).toBe("settled");
      expect(
        await rejectionCode(
          h
            .as(OWNER, ACAD)
            .curriculum.unplace({ slotId: settled.plan[0]?.id ?? "" }),
        ),
      ).toBe("PRECONDITION_FAILED");

      await h.as(COACH, ACAD).curriculum.setRunNote({
        placementId: row,
        note: "We only got through mount",
      });
      expect(
        (await h.as(OWNER, ACAD).curriculum.board()).plan[0]?.themes[0]?.note,
      ).toBe("We only got through mount");

      await h
        .as(COACH, ACAD)
        .curriculum.setRunNote({ placementId: row, note: "" });
      expect(
        (await h.as(OWNER, ACAD).curriculum.board()).plan[0]?.themes[0]?.note,
      ).toBeNull();
    });

    it("refuses a student, and another gym's placement", async () => {
      await reset();
      const made = await block("Closed guard", 1);
      await h
        .as(OWNER, ACAD)
        .curriculum.place({ trackId: mainTrack, blockId: made.id, atIndex: 0 });
      const board = await h.as(OWNER, ACAD).curriculum.board();
      const row = board.plan[0]?.themes[0]?.placementId ?? "";

      expect(
        await rejectionCode(
          h
            .as(STUDENT, ACAD)
            .curriculum.setRunNote({ placementId: row, note: "Mine" }),
        ),
      ).toBe("FORBIDDEN");
      expect(
        await rejectionCode(
          h
            .as(OTHER_OWNER, OTHER)
            .curriculum.setRunNote({ placementId: row, note: "Mine" }),
        ),
      ).toBe("NOT_FOUND");
    });
  });

  describe("several blocks on one stretch of weeks", () => {
    const stretchOf = async (themes: string[], weeks = 2) => {
      const [head, ...rest] = themes;
      const first = await block(head ?? "", weeks);
      const slot = await h.as(OWNER, ACAD).curriculum.place({
        trackId: mainTrack,
        blockId: first.id,
        atIndex: 500,
      });
      for (const theme of rest) {
        const made = await block(theme, weeks);
        await h.as(OWNER, ACAD).curriculum.place({
          trackId: mainTrack,
          blockId: made.id,
          atIndex: 500,
          slotId: slot.slotId,
        });
      }
      return slot.slotId;
    };

    it("runs two blocks over the same weeks, and counts both", async () => {
      await reset();
      await stretchOf(["Standing", "Pinning"]);

      const board = await h.as(OWNER, ACAD).curriculum.board();
      expect(board.plan).toHaveLength(1);
      expect(board.plan[0]?.themes.map((on) => on.theme)).toEqual([
        "Standing",
        "Pinning",
      ]);
      expect(board.plan[0]?.weeks).toBe(2);
      expect(board.blocks.map((b) => b.used)).toEqual([1, 1]);
    });

    it("keeps a stretch's themes on the same dates when it is resized", async () => {
      await reset();
      const slot = await stretchOf(["Standing", "Pinning"]);
      await h.as(OWNER, ACAD).curriculum.place({
        trackId: mainTrack,
        blockId: (await block("Guard", 1)).id,
        atIndex: 500,
      });
      await h.as(OWNER, ACAD).curriculum.resize({ slotId: slot, weeks: 5 });

      const board = await h.as(OWNER, ACAD).curriculum.board();
      const rows = await h.pg.query(
        `SELECT DISTINCT starts_on, ends_on, weeks FROM curriculum_block
           WHERE slot_id = $1`,
        [slot],
      );
      expect(rows.rows).toHaveLength(1);
      expect(board.plan[0]?.weeks).toBe(5);
      expect(board.plan[1]?.startsOn).toBe(
        addDays(board.plan[0]?.endsOn ?? "", 1),
      );
    });

    it("refuses the same block twice, and an eleventh block, on one stretch", async () => {
      await reset();
      const slot = await stretchOf(["Standing"]);
      const again = (await h.as(OWNER, ACAD).curriculum.board()).blocks[0];
      expect(
        await rejectionCode(
          h.as(OWNER, ACAD).curriculum.place({
            trackId: mainTrack,
            blockId: again?.id ?? "",
            atIndex: 0,
            slotId: slot,
          }),
        ),
      ).toBe("PRECONDITION_FAILED");

      for (let n = 2; n <= MAX_SLOT_BLOCKS; n++) {
        const made = await block(`Block ${n}`, 2);
        await h.as(OWNER, ACAD).curriculum.place({
          trackId: mainTrack,
          blockId: made.id,
          atIndex: 0,
          slotId: slot,
        });
      }
      const spare = await block("One too many", 2);
      expect(
        await rejectionCode(
          h.as(OWNER, ACAD).curriculum.place({
            trackId: mainTrack,
            blockId: spare.id,
            atIndex: 0,
            slotId: slot,
          }),
        ),
      ).toBe("PRECONDITION_FAILED");
    });

    it("drops one theme without moving anything, and keeps the last one", async () => {
      await reset();
      const slot = await stretchOf(["Standing", "Pinning"]);
      const before = await h.as(OWNER, ACAD).curriculum.board();
      const pinning = before.plan[0]?.themes[1];

      await h
        .as(COACH, ACAD)
        .curriculum.removeTheme({ placementId: pinning?.placementId ?? "" });
      const after = await h.as(OWNER, ACAD).curriculum.board();
      expect(after.plan).toHaveLength(1);
      expect(after.plan[0]?.themes.map((on) => on.theme)).toEqual(["Standing"]);
      expect(after.plan[0]?.startsOn).toBe(before.plan[0]?.startsOn);
      expect(after.plan[0]?.endsOn).toBe(before.plan[0]?.endsOn);

      expect(
        await rejectionCode(
          h.as(OWNER, ACAD).curriculum.removeTheme({
            placementId: after.plan[0]?.themes[0]?.placementId ?? "",
          }),
        ),
      ).toBe("PRECONDITION_FAILED");

      await h.as(OWNER, ACAD).curriculum.unplace({ slotId: slot });
      expect((await h.as(OWNER, ACAD).curriculum.board()).plan).toHaveLength(0);
    });
  });
});
