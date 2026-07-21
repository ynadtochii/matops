/**
 * Pull the invite token out of whatever the user pasted or the OS handed us:
 * a deep link (`matops://join/<token>`), an https web link
 * (`https://host/join/<token>?x=1`), or a bare token. Returns null when there is
 * nothing usable. Kept pure so it is trivially unit-testable.
 */
export function extractInviteToken(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const marker = "/join/";
  const i = s.lastIndexOf(marker);
  const tail = i >= 0 ? s.slice(i + marker.length) : s;
  // Stop at the first path separator, query, or hash.
  const token = tail.split(/[/?#]/)[0]?.trim() ?? "";
  return token.length > 0 ? token : null;
}
