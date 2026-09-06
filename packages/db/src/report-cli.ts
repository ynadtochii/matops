import { db, pool } from "./client";
import {
  funnelSummary,
  organizationMilestones,
  weeklyOwnerOnly,
  weeklyRetainedUse,
  weeklyTwoBranchUse,
  weeksBack,
  weekTwoBookers,
} from "./product-report";

const weeks = Number(process.argv[2] ?? 12);

async function main() {
  const since = weeksBack(weeks, new Date());
  const rows = await weeklyRetainedUse(since, db);

  console.log(
    `Retained use, ${weeks} weeks from ${since.toISOString().slice(0, 10)}`,
  );
  console.log("week        gyms  booking  attendance  events");
  for (const r of rows) {
    console.log(
      `${r.weekStart}  ${String(r.activeOrganizations).padStart(4)}  ` +
        `${String(r.bookingOrganizations).padStart(7)}  ` +
        `${String(r.attendanceOrganizations).padStart(10)}  ` +
        `${String(r.events).padStart(6)}`,
    );
  }
  if (rows.length === 0) console.log("(no student activity yet)");

  const twoBranch = await weeklyTwoBranchUse(since, db);
  const twoBranchWeeks = twoBranch.filter((w) => w.organizations > 0);
  console.log("");
  console.log("Weeks with a gym using two branches:");
  for (const w of twoBranchWeeks) {
    console.log(`${w.weekStart}  ${w.organizations}`);
  }
  if (twoBranchWeeks.length === 0) console.log("(none)");

  const ownerOnly = (await weeklyOwnerOnly(since, db)).filter(
    (w) => w.organizations > 0,
  );
  console.log("");
  console.log("Counter-metric, weeks where staff worked and no student did:");
  for (const w of ownerOnly) {
    console.log(`${w.weekStart}  ${w.organizations}`);
  }
  if (ownerOnly.length === 0) console.log("(none)");

  const funnel = funnelSummary(await organizationMilestones(db));
  console.log("");
  console.log(`Gyms: ${funnel.gyms}`);
  for (const [step, n] of Object.entries(funnel.reached)) {
    console.log(`  ${step.padEnd(18)} ${n}`);
  }
  console.log(`  ${"setupComplete".padEnd(18)} ${funnel.setupComplete}`);
  console.log(`  ${"weekTwoBooking".padEnd(18)} ${await weekTwoBookers(db)}`);
  console.log(
    `Median days to first schedule: ${funnel.medianDaysToSchedule ?? "n/a"}`,
  );
  console.log(
    `Median days to first student booking: ${funnel.medianDaysToFirstBooking ?? "n/a"}`,
  );
}

await main();
await pool.end();
