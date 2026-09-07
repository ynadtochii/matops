import { afterEach, describe, expect, it } from "vitest";

import { notificationOutbox } from "@matops/db/schema";

import type { Harness } from "./helpers";
import { readScheduledJobHealth, runRecordedJob } from "../src/job-run";
import { harness, seedAcademies } from "./helpers";

const A = "job_health_a";
const B = "job_health_b";
const OWNER_A = "job_health_owner_a";
const MANAGER_A = "job_health_manager_a";
const OWNER_B = "job_health_owner_b";

let open: Harness | null = null;

afterEach(async () => {
  await open?.close();
  open = null;
});

async function setup(): Promise<Harness> {
  const h = await harness();
  open = h;
  await seedAcademies(h.pg, [
    {
      id: A,
      code: "800001",
      members: [
        { userId: OWNER_A, role: "owner", status: "active" },
        { userId: MANAGER_A, role: "manager", status: "active" },
      ],
    },
    {
      id: B,
      code: "800002",
      members: [{ userId: OWNER_B, role: "owner", status: "active" }],
    },
  ]);
  return h;
}

describe("scheduled job health", () => {
  it("records success, failure, and overdue state", async () => {
    const h = await setup();
    await runRecordedJob(h.exec, "notification_delivery", () =>
      Promise.resolve({ failed: 0 }),
    );
    await expect(
      runRecordedJob(h.exec, "membership_sweep", () =>
        Promise.reject(new Error("sweep stopped")),
      ),
    ).rejects.toThrow("sweep stopped");

    const health = await readScheduledJobHealth(
      h.exec,
      A,
      new Date(Date.now() + 31 * 60 * 60_000),
    );
    expect(
      health.jobs.find((job) => job.job === "notification_delivery"),
    ).toMatchObject({ status: "succeeded", overdue: true });
    expect(
      health.jobs.find((job) => job.job === "membership_sweep"),
    ).toMatchObject({
      status: "failed",
      overdue: true,
    });
    expect(
      health.jobs.find((job) => job.job === "calendar_materialization"),
    ).toMatchObject({ status: "never_run", overdue: true });
  });

  it("keeps exhausted email counts inside the active organization", async () => {
    const h = await setup();
    await runRecordedJob(h.exec, "notification_delivery", () =>
      Promise.resolve({ failed: 0 }),
    );
    await h.exec.insert(notificationOutbox).values([
      {
        academyId: A,
        eventKey: "job:a",
        recipientKey: "user:a",
        recipientAddress: "a@example.com",
        channel: "email",
        subject: "A",
        body: "A",
        status: "failed",
        attempts: 10,
      },
      {
        academyId: B,
        eventKey: "job:b",
        recipientKey: "user:b",
        recipientAddress: "b@example.com",
        channel: "email",
        subject: "B",
        body: "B",
        status: "failed",
        attempts: 10,
      },
    ]);

    expect(
      (await h.as(OWNER_A, A).organization.jobHealth()).exhaustedEmails,
    ).toBe(1);
    expect(
      (await h.as(MANAGER_A, A).organization.jobHealth()).exhaustedEmails,
    ).toBe(1);
    expect(
      (await h.as(OWNER_B, B).organization.jobHealth()).exhaustedEmails,
    ).toBe(1);
  });

  it("records a bounded run with remaining work as failed", async () => {
    const h = await setup();
    await runRecordedJob(
      h.exec,
      "calendar_materialization",
      () => Promise.resolve({ hasMore: true }),
      {
        succeeded: (result) => !result.hasMore,
        failureMessage: () => "Calendar materialization has more work",
      },
    );

    const health = await readScheduledJobHealth(h.exec, A);
    expect(
      health.jobs.find((job) => job.job === "calendar_materialization"),
    ).toMatchObject({ status: "failed", overdue: true });
  });
});
