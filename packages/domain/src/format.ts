/**
 * Shared class-time formatting. Both clients render times in the device's zone,
 * so the rule lives here rather than being copied per screen.
 */

export const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Clock split into the numerals and the AM/PM tail, so a column of times lines
 * up on the digits. The separator can be a narrow no-break space, so split on
 * any whitespace.
 */
export function clockParts(d: Date): { clock: string; period: string } {
  const [clock = "", period = ""] = timeFmt.format(d).split(/\s+/);
  return { clock, period };
}
