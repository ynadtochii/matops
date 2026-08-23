import { describe, expect, it } from "vitest";

import type { ExportMember } from "../src/csv";
import { membersCsv, membersCsvFilename } from "../src/csv";

const m = (over: Partial<ExportMember> = {}): ExportMember => ({
  name: "Ana Silva",
  email: "ana@example.com",
  phone: "+380501112233",
  role: "student",
  status: "active",
  joinedAt: new Date("2026-03-04T10:00:00Z"),
  visitCount: 12,
  dues: null,
  ...over,
});

describe("membersCsv", () => {
  it("writes a header row and one CRLF-terminated row per member", () => {
    const [header, row, tail] = membersCsv([m()]).split("\r\n");
    expect(header).toBe(
      "Name,Email,Phone,Role,Status,Joined,Visits,Plan,Dues status,Next due",
    );
    expect(row).toBe(
      "Ana Silva,ana@example.com,+380501112233,student,active,2026-03-04,12,,,",
    );
    expect(tail).toBe("");
  });

  it("keeps the header when there are no members", () => {
    expect(membersCsv([]).split("\r\n")).toHaveLength(2);
  });

  it("fills the dues columns when the member has a plan", () => {
    const csv = membersCsv([
      m({
        dues: {
          status: "overdue",
          planName: "Unlimited",
          nextDueAt: new Date("2026-08-01T09:00:00Z"),
        },
      }),
    ]);
    expect(csv).toContain(",Unlimited,overdue,2026-08-01");
  });

  it("leaves a missing phone and a missing next due empty", () => {
    const csv = membersCsv([
      m({
        phone: null,
        dues: { status: "due", planName: "Kids", nextDueAt: null },
      }),
    ]);
    expect(csv.split("\r\n")[1]).toBe(
      "Ana Silva,ana@example.com,,student,active,2026-03-04,12,Kids,due,",
    );
  });

  it("quotes commas, quotes and newlines", () => {
    const row = membersCsv([m({ name: 'Silva, "Ana"\nJr' })]).split("\r\n")[1];
    expect(row?.startsWith('"Silva, ""Ana""\nJr",')).toBe(true);
  });

  it("defuses a name a spreadsheet would run as a formula", () => {
    expect(membersCsv([m({ name: "=HYPERLINK(1)" })])).toContain(
      "'=HYPERLINK(1)",
    );
    expect(membersCsv([m({ name: "@SUM(A1)" })])).toContain("'@SUM(A1)");
    expect(
      membersCsv([m({ name: "-2+cmd|' /C calc'!A0" })]).split("\r\n")[1],
    ).toMatch(/^"'-2\+cmd/);
  });

  it("leaves a plain phone number alone", () => {
    expect(membersCsv([m({ phone: "+38 (050) 111-22-33" })])).toContain(
      "+38 (050) 111-22-33",
    );
  });
});

describe("membersCsvFilename", () => {
  it("slugs the academy and stamps the day", () => {
    expect(
      membersCsvFilename("Alma beta", new Date("2026-08-22T12:00:00Z")),
    ).toBe("alma-beta-members-2026-08-22.csv");
  });
});
