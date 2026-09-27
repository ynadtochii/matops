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
