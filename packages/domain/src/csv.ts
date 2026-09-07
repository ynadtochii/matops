/**
 * The owner's member export (spec O4). Pure string building. The web wraps the
 * result in a Blob and downloads it, so nothing here touches the DOM.
 */
import { dayKey } from "./format";
import { slugify } from "./slug";

/** The member fields the export needs: a subset of the owner member list row. */
export interface ExportMember {
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  joinedAt: string | Date;
  visitCount: number;
}

const HEADERS = [
  "Name",
  "Email",
  "Phone",
  "Role",
  "Status",
  "Joined",
  "Visits",
] as const;

/**
 * Excel and Sheets run a cell starting with `=`, `+`, `-` or `@` as a formula, so
 * a member could put live code in an owner's spreadsheet by naming themselves
 * `=HYPERLINK(...)`. Those values get an apostrophe in front AND quotes around
 * them: the apostrophe alone is stripped by some importers, and the quotes force
 * the cell to be read as text. A `+`/`-` value made only of digits, spaces and
 * brackets is exempt, because that is a phone number and Excel reads it as a
 * plain number.
 */
const RISKY = /^[=@\t\r]|^[+-](?![\d\s()+-]*$)/;

/** One RFC 4180 field. */
function field(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  const risky = RISKY.test(s);
  const safe = risky ? `'${s}` : s;
  return risky || /[",\n\r]/.test(safe)
    ? `"${safe.replace(/"/g, '""')}"`
    : safe;
}

export function csvDocument(
  headers: readonly string[],
  rows: readonly (readonly (string | number | boolean | null)[])[],
): string {
  return `${[headers, ...rows]
    .map((row) =>
      row
        .map((value) =>
          field(typeof value === "boolean" ? String(value) : value),
        )
        .join(","),
    )
    .join("\r\n")}\r\n`;
}

export function parseCsv(source: string): string[][] {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"' && value.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (quoted) throw new Error("The CSV has an unclosed quoted field");
  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.length > 0));
}

const day = (d: string | Date | null): string =>
  d === null ? "" : dayKey(new Date(d));

/** The member list as CSV, one row per member, in the order given. */
export function membersCsv(rows: ExportMember[]): string {
  const lines = [
    HEADERS.join(","),
    ...rows.map((m) =>
      [
        m.name,
        m.email,
        m.phone,
        m.role,
        m.status,
        day(m.joinedAt),
        m.visitCount,
      ]
        .map(field)
        .join(","),
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

/** File name for the download, e.g. "alma-beta-members-2026-08-22.csv". */
export function membersCsvFilename(academyName: string, today: Date): string {
  return `${slugify(academyName)}-members-${dayKey(today)}.csv`;
}
