import { afterEach, describe, expect, it } from "vitest";

import {
  enqueueOutboxEmails,
  runNotificationOutbox,
} from "../src/notification-outbox";
import { execOn, freshDb } from "./helpers";

describe("notification outbox", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => close?.());

  it("deduplicates an event recipient and channel", async () => {
    const pg = await freshDb(["academy_A"]);
    close = () => pg.close();
    const exec = execOn(pg);
    const row = {
      academyId: "academy_A",
      eventKey: "class_cancelled:class_1",
      recipientKey: "user:u_1",
      recipientAddress: "student@example.com",
      subject: "Class cancelled",
      body: "No class tonight.",
    };
    expect(await enqueueOutboxEmails([row], exec)).toBe(1);
    expect(await enqueueOutboxEmails([row], exec)).toBe(0);
  });

  it("keeps a failed send visible and retries it", async () => {
    const pg = await freshDb(["academy_A"]);
    close = () => pg.close();
    const exec = execOn(pg);
    await enqueueOutboxEmails(
      [
        {
          academyId: "academy_A",
          eventKey: "class_changed:class_1",
          recipientKey: "user:u_1",
          recipientAddress: "student@example.com",
          subject: "Class changed",
          body: "The class moved.",
        },
      ],
      exec,
    );
    const first = await runNotificationOutbox(
      exec,
      () => Promise.resolve({ sent: false, ok: false }),
      { now: new Date("2030-09-07T12:00:00Z") },
    );
    expect(first).toMatchObject({ claimed: 1, failed: 1, sent: 0 });
    const failed = await pg.query<{ status: string; attempts: number }>(
      "SELECT status, attempts FROM notification_outbox",
    );
    expect(failed.rows[0]).toEqual({ status: "failed", attempts: 1 });
    const second = await runNotificationOutbox(
      exec,
      () => Promise.resolve({ sent: true, ok: true }),
      { now: new Date("2030-09-07T12:03:00Z") },
    );
    expect(second).toMatchObject({ claimed: 1, failed: 0, sent: 1 });
  });

  it("leaves a delivery visible after its final attempt", async () => {
    const pg = await freshDb(["academy_A"]);
    close = () => pg.close();
    const exec = execOn(pg);
    await enqueueOutboxEmails(
      [
        {
          academyId: "academy_A",
          eventKey: "class_changed:class_2",
          recipientKey: "user:u_2",
          recipientAddress: "student@example.com",
          subject: "Class changed",
          body: "The class moved.",
        },
      ],
      exec,
    );
    await pg.exec(
      `UPDATE notification_outbox SET attempts = 9, next_attempt_at = '2030-09-07T12:00:00Z'`,
    );

    const result = await runNotificationOutbox(
      exec,
      () => Promise.resolve({ sent: false, ok: false }),
      { now: new Date("2030-09-07T12:00:00Z") },
    );
    const failed = await pg.query<{ status: string; attempts: number }>(
      "SELECT status, attempts FROM notification_outbox",
    );

    expect(result).toMatchObject({ failed: 1, exhausted: 1 });
    expect(failed.rows[0]).toEqual({ status: "failed", attempts: 10 });
  });
});
