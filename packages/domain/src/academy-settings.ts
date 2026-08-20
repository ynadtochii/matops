export const FALLBACK_TIME_ZONE = "UTC";

export function isValidTimeZone(zone: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function timeZoneOptions(current?: string | null): string[] {
  const supported = Intl.supportedValuesOf as
    | ((key: "timeZone") => string[])
    | undefined;
  const zones = new Set(
    supported ? supported("timeZone") : [FALLBACK_TIME_ZONE],
  );
  // `supportedValuesOf` lists canonical ids only, so a stored alias
  // ("Europe/Kyiv" for "Europe/Kiev") would leave the picker with nothing
  // selected and silently rewrite the zone on the next save.
  if (current && isValidTimeZone(current)) zones.add(current);
  return [...zones].sort((a, b) => a.localeCompare(b));
}

export function resolveAcademyTimeZone(
  stored: string | null | undefined,
  templateZone?: string | null,
): string {
  if (stored && isValidTimeZone(stored)) return stored;
  if (templateZone && isValidTimeZone(templateZone)) return templateZone;
  return FALLBACK_TIME_ZONE;
}

export function driftingTemplateZones(
  academyZone: string,
  templateZones: readonly string[],
): string[] {
  return [...new Set(templateZones)].filter((z) => z !== academyZone).sort();
}

export function academyMapUrl(
  address: string | null | undefined,
): string | null {
  const q = (address ?? "").trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function deleteAcademyPhrase(name: string): string {
  return `delete ${name.trim()}`;
}

export function matchesDeleteAcademyPhrase(
  typed: string,
  name: string,
): boolean {
  const fold = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return fold(typed) === fold(deleteAcademyPhrase(name));
}
