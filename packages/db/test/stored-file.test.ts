import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DbExec } from "../src/client";
import { eraseMemberData } from "../src/erase";
import {
  academyStoredBytes,
  deleteStoredFiles,
  getStoredFile,
  insertPendingFile,
  markFileReady,
  stalePendingFiles,
} from "../src/stored-file";
import { withScope } from "../src/tenant";
import { execOn, freshDb, seedMemberships, single } from "./helpers";

const USER_A = "u_academy_A_mem_a";
const USER_A2 = "u_academy_A_mem_a2";
const USER_B = "u_academy_B_mem_b";

let seq = 0;
const nextId = () =>
  `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

function scoped<T>(
  exec: DbExec,
  academyId: string,
  run: Parameters<typeof withScope<T>>[1],
): Promise<T> {
  return withScope(
    { organizationId: academyId, entityId: academyId },
    run,
    exec,
  );
}

function pendingInput(academyId: string, uploadedBy: string, kind = "avatar") {
  const id = nextId();
  return {
    id,
    academyId,
    uploadedBy,
    kind,
    objectKey: `${kind}/${academyId}/${id}.webp`,
    contentType: "image/webp",
    sizeBytes: 100,
  };
}

describe("stored_file (ADR 152)", () => {
  let pg: PGlite;
  let exec: DbExec;

  beforeAll(async () => {
    pg = await freshDb();
    exec = execOn(pg);
    await seedMemberships(pg, "academy_A", ["mem_a", "mem_a2"]);
    await seedMemberships(pg, "academy_B", ["mem_b"]);
  });

  afterAll(async () => {
    await pg.close();
  });

  it("shows a file only inside its own academy", async () => {
    const input = pendingInput("academy_A", USER_A);
    await scoped(exec, "academy_A", (tx) => insertPendingFile(input, tx));

    const fromA = await scoped(exec, "academy_A", (tx) =>
      getStoredFile({ academyId: "academy_A", id: input.id }, tx),
    );
    const fromB = await scoped(exec, "academy_B", (tx) =>
      getStoredFile({ academyId: "academy_A", id: input.id }, tx),
    );

    expect(fromA?.status).toBe("pending");
    expect(fromB).toBeNull();
  });

  it("refuses a row for another academy", async () => {
    await expect(
      scoped(exec, "academy_A", (tx) =>
        insertPendingFile(pendingInput("academy_B", USER_B), tx),
      ),
    ).rejects.toThrow();
  });

  it("refuses an unknown kind, an unknown status and an empty file", async () => {
    await expect(
      scoped(exec, "academy_A", (tx) =>
        insertPendingFile(
          { ...pendingInput("academy_A", USER_A), kind: "document" },
          tx,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      scoped(exec, "academy_A", (tx) =>
        insertPendingFile(
          { ...pendingInput("academy_A", USER_A), sizeBytes: 0 },
          tx,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      pg.query(
        `INSERT INTO stored_file (academy_id, kind, object_key, content_type, size_bytes, status)
         VALUES ('academy_A', 'avatar', 'avatar/x/status.webp', 'image/webp', 1, 'done')`,
      ),
    ).rejects.toThrow();
  });

  it("marks a pending file ready", async () => {
    const input = pendingInput("academy_A", USER_A);
    await scoped(exec, "academy_A", (tx) => insertPendingFile(input, tx));

    const file = await scoped(exec, "academy_A", async (tx) => {
      await markFileReady({ academyId: "academy_A", id: input.id }, tx);
      return getStoredFile({ academyId: "academy_A", id: input.id }, tx);
    });

    expect(file?.status).toBe("ready");
  });

  it("finds the academy's stale pending files from any uploader", async () => {
    const old = pendingInput("academy_A", USER_A2);
    const fresh = pendingInput("academy_A", USER_A2);
    const oldReady = pendingInput("academy_A", USER_A2);
    const otherUser = pendingInput("academy_A", USER_A);
    await scoped(exec, "academy_A", async (tx) => {
      for (const input of [old, fresh, oldReady, otherUser]) {
        await insertPendingFile(input, tx);
      }
      await markFileReady({ academyId: "academy_A", id: oldReady.id }, tx);
    });
    await pg.query(
      `UPDATE stored_file SET created_at = now() - interval '2 days' WHERE id = ANY($1)`,
      [[old.id, oldReady.id, otherUser.id]],
    );

    const stale = await scoped(exec, "academy_A", (tx) =>
      stalePendingFiles(
        {
          academyId: "academy_A",
          before: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
        tx,
      ),
    );

    expect(stale).toHaveLength(2);
    expect(stale).toEqual(
      expect.arrayContaining([
        { id: old.id, objectKey: old.objectKey },
        { id: otherUser.id, objectKey: otherUser.objectKey },
      ]),
    );
  });

  it("sums the bytes of one academy", async () => {
    const before = await scoped(exec, "academy_B", (tx) =>
      academyStoredBytes("academy_B", tx),
    );
    await scoped(exec, "academy_B", (tx) =>
      insertPendingFile(
        { ...pendingInput("academy_B", USER_B), sizeBytes: 5_000 },
        tx,
      ),
    );

    const after = await scoped(exec, "academy_B", (tx) =>
      academyStoredBytes("academy_B", tx),
    );

    expect(after - before).toBe(5_000);
  });

  it("returns the keys it deletes and unlinks the avatar", async () => {
    const input = pendingInput("academy_A", USER_A);
    await scoped(exec, "academy_A", (tx) => insertPendingFile(input, tx));
    await pg.query(
      `UPDATE entity_membership SET avatar_file_id = $1 WHERE id = 'mem_a'`,
      [input.id],
    );

    const keys = await scoped(exec, "academy_B", (tx) =>
      deleteStoredFiles({ academyId: "academy_A", ids: [input.id] }, tx),
    );
    expect(keys).toEqual([]);

    const deleted = await scoped(exec, "academy_A", (tx) =>
      deleteStoredFiles({ academyId: "academy_A", ids: [input.id] }, tx),
    );
    expect(deleted).toEqual([input.objectKey]);

    const membership = single(
      await pg.query<{ avatar_file_id: string | null }>(
        `SELECT avatar_file_id FROM entity_membership WHERE id = 'mem_a'`,
      ),
    );
    expect(membership.avatar_file_id).toBeNull();
  });

  it("lets an erase take the member's avatar and receipts but not the icon", async () => {
    await pg.query(`DELETE FROM stored_file`);
    const avatar = pendingInput("academy_A", USER_A2);
    const receipt = pendingInput("academy_A", USER_A2, "payment_receipt");
    const icon = pendingInput("academy_A", USER_A2, "academy_icon");
    const someoneElse = pendingInput("academy_A", USER_A);
    await scoped(exec, "academy_A", async (tx) => {
      for (const input of [avatar, receipt, icon, someoneElse]) {
        await insertPendingFile(input, tx);
      }
    });

    const result = await scoped(exec, "academy_A", (tx) =>
      eraseMemberData(tx, {
        academyId: "academy_A",
        memberId: "mem_a2",
        userId: USER_A2,
      }),
    );

    expect(result.objectKeys.sort()).toEqual(
      [avatar.objectKey, receipt.objectKey].sort(),
    );
    expect(result.report.stored_file).toBe(2);
    const left = await pg.query<{ id: string }>(
      `SELECT id FROM stored_file ORDER BY id`,
    );
    expect(left.rows.map((r) => r.id).sort()).toEqual(
      [icon.id, someoneElse.id].sort(),
    );
  });
});
