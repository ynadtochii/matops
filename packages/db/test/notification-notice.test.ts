import { afterEach, describe, expect, it } from "vitest";

import {
  createNotice,
  deliverNoticeBatch,
  noticeStatus,
} from "../src/notification-notice";
import { execOn, freshDb } from "./helpers";

describe("notification notices", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => close?.());

  it("keeps accepted recipients out of later sends", async () => {
    const pg = await freshDb(["academy_A"]);
    close = () => pg.close();
    const exec = execOn(pg);
    const created = await createNotice(
      {
        academyId: "academy_A",
        eventKey: "class_cancelled:class_1",
        kind: "class_cancelled",
        subject: "Class cancelled",
        body: "No class tonight.",
        templateVersion: "1",
        recipients: [
          {
            recipientKey: "user:u_1",
            userId: "u_1",
            email: "student@example.com",
          },
        ],
      },
      exec,
    );
    const first = await deliverNoticeBatch(
      exec,
      () => Promise.resolve({ sent: true, ok: true }),
      { noticeId: created.noticeId, mode: "remaining" },
    );
    const second = await deliverNoticeBatch(
      exec,
      () => Promise.resolve({ sent: true, ok: true }),
      { noticeId: created.noticeId, mode: "remaining" },
    );
    expect(first.accepted).toBe(1);
    expect(second.claimed).toBe(0);
  });

  it("retries failed recipients only when requested", async () => {
    const pg = await freshDb(["academy_A"]);
    close = () => pg.close();
    const exec = execOn(pg);
    const created = await createNotice(
      {
        academyId: "academy_A",
        eventKey: "class_changed:class_1",
        kind: "class_changed",
        subject: "Class changed",
        body: "The class moved.",
        templateVersion: "1",
        recipients: [
          { recipientKey: "user:u_1", email: "student@example.com" },
        ],
      },
      exec,
    );
    await deliverNoticeBatch(
      exec,
      () => Promise.resolve({ sent: false, ok: false, errorCode: "rejected" }),
      { noticeId: created.noticeId, mode: "remaining" },
    );
    expect(
      (
        await deliverNoticeBatch(
          exec,
          () => Promise.resolve({ sent: true, ok: true }),
          { noticeId: created.noticeId, mode: "remaining" },
        )
      ).claimed,
    ).toBe(0);
    expect(
      (
        await deliverNoticeBatch(
          exec,
          () => Promise.resolve({ sent: true, ok: true }),
          { noticeId: created.noticeId, mode: "failed" },
        )
      ).accepted,
    ).toBe(1);
  });

  it("reports missing email and recipients beyond the batch", async () => {
    const pg = await freshDb(["academy_A"]);
    close = () => pg.close();
    const exec = execOn(pg);
    const created = await createNotice(
      {
        academyId: "academy_A",
        eventKey: "class_changed:class_2",
        kind: "class_changed",
        subject: "Class changed",
        body: "The class moved.",
        templateVersion: "1",
        recipients: [
          { recipientKey: "user:u_1", email: "one@example.com" },
          { recipientKey: "user:u_2", email: "two@example.com" },
          { recipientKey: "user:u_3" },
        ],
      },
      exec,
    );
    const result = await deliverNoticeBatch(
      exec,
      () => Promise.resolve({ sent: true, ok: true }),
      { noticeId: created.noticeId, mode: "remaining", limit: 1 },
    );
    const status = await noticeStatus(exec, created.noticeId);
    expect(result).toMatchObject({ accepted: 1, remaining: 1 });
    expect(status.counts.noEmail).toBe(1);
  });
});
