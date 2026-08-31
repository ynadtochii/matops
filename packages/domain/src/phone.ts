/**
 * One way to ask for a phone number (ADR 119). Every form that captures a
 * person picks a country and types the rest, so what reaches the server is
 * E.164 (`+351912345678`) and not five spellings of the same number.
 *
 * No phone library. Per-country length and prefix rules are what
 * `libphonenumber-js` is for, and it costs 75-145 kB in a bundle whose shared
 * floor is already the largest thing on the frontend budget (roadmap B.5).
 * With the country picked explicitly, the E.164 shape carries the weight.
 */

export interface DialCountry {
  /** ISO 3166-1 alpha-2. */
  iso: string;
  name: string;
  /** International dialling prefix, with the plus. */
  dial: string;
}

/**
 * The countries the picker offers, by name. Not every country: a list of ~70
 * covering Europe, the Americas and the places members commonly come from is
 * the part that earns its bytes, and an unlisted number is still typed in full
 * by choosing the nearest country and correcting the prefix.
 */
export const DIAL_COUNTRIES: DialCountry[] = [
  { iso: "AR", name: "Argentina", dial: "+54" },
  { iso: "AU", name: "Australia", dial: "+61" },
  { iso: "AT", name: "Austria", dial: "+43" },
  { iso: "BD", name: "Bangladesh", dial: "+880" },
  { iso: "BE", name: "Belgium", dial: "+32" },
  { iso: "BO", name: "Bolivia", dial: "+591" },
  { iso: "BR", name: "Brazil", dial: "+55" },
  { iso: "BG", name: "Bulgaria", dial: "+359" },
  { iso: "CA", name: "Canada", dial: "+1" },
  { iso: "CL", name: "Chile", dial: "+56" },
  { iso: "CN", name: "China", dial: "+86" },
  { iso: "CO", name: "Colombia", dial: "+57" },
  { iso: "CR", name: "Costa Rica", dial: "+506" },
  { iso: "HR", name: "Croatia", dial: "+385" },
  { iso: "CZ", name: "Czechia", dial: "+420" },
  { iso: "DK", name: "Denmark", dial: "+45" },
  { iso: "DO", name: "Dominican Republic", dial: "+1" },
  { iso: "EC", name: "Ecuador", dial: "+593" },
  { iso: "EG", name: "Egypt", dial: "+20" },
  { iso: "EE", name: "Estonia", dial: "+372" },
  { iso: "FI", name: "Finland", dial: "+358" },
  { iso: "FR", name: "France", dial: "+33" },
  { iso: "DE", name: "Germany", dial: "+49" },
  { iso: "GR", name: "Greece", dial: "+30" },
  { iso: "HU", name: "Hungary", dial: "+36" },
  { iso: "IS", name: "Iceland", dial: "+354" },
  { iso: "IN", name: "India", dial: "+91" },
  { iso: "ID", name: "Indonesia", dial: "+62" },
  { iso: "IE", name: "Ireland", dial: "+353" },
  { iso: "IL", name: "Israel", dial: "+972" },
  { iso: "IT", name: "Italy", dial: "+39" },
  { iso: "JP", name: "Japan", dial: "+81" },
  { iso: "KE", name: "Kenya", dial: "+254" },
  { iso: "LV", name: "Latvia", dial: "+371" },
  { iso: "LT", name: "Lithuania", dial: "+370" },
  { iso: "LU", name: "Luxembourg", dial: "+352" },
  { iso: "MY", name: "Malaysia", dial: "+60" },
  { iso: "MX", name: "Mexico", dial: "+52" },
  { iso: "MA", name: "Morocco", dial: "+212" },
  { iso: "NL", name: "Netherlands", dial: "+31" },
  { iso: "NZ", name: "New Zealand", dial: "+64" },
  { iso: "NG", name: "Nigeria", dial: "+234" },
  { iso: "NO", name: "Norway", dial: "+47" },
  { iso: "PK", name: "Pakistan", dial: "+92" },
  { iso: "PA", name: "Panama", dial: "+507" },
  { iso: "PY", name: "Paraguay", dial: "+595" },
  { iso: "PE", name: "Peru", dial: "+51" },
  { iso: "PH", name: "Philippines", dial: "+63" },
  { iso: "PL", name: "Poland", dial: "+48" },
  { iso: "PT", name: "Portugal", dial: "+351" },
  { iso: "RO", name: "Romania", dial: "+40" },
  { iso: "RU", name: "Russia", dial: "+7" },
  { iso: "SA", name: "Saudi Arabia", dial: "+966" },
  { iso: "RS", name: "Serbia", dial: "+381" },
  { iso: "SG", name: "Singapore", dial: "+65" },
  { iso: "SK", name: "Slovakia", dial: "+421" },
  { iso: "SI", name: "Slovenia", dial: "+386" },
  { iso: "ZA", name: "South Africa", dial: "+27" },
  { iso: "KR", name: "South Korea", dial: "+82" },
  { iso: "ES", name: "Spain", dial: "+34" },
  { iso: "SE", name: "Sweden", dial: "+46" },
  { iso: "CH", name: "Switzerland", dial: "+41" },
  { iso: "TW", name: "Taiwan", dial: "+886" },
  { iso: "TH", name: "Thailand", dial: "+66" },
  { iso: "TR", name: "Türkiye", dial: "+90" },
  { iso: "UA", name: "Ukraine", dial: "+380" },
  { iso: "AE", name: "United Arab Emirates", dial: "+971" },
  { iso: "GB", name: "United Kingdom", dial: "+44" },
  { iso: "US", name: "United States", dial: "+1" },
  { iso: "UY", name: "Uruguay", dial: "+598" },
  { iso: "VE", name: "Venezuela", dial: "+58" },
  { iso: "VN", name: "Vietnam", dial: "+84" },
];

/** Where the picker lands when the academy has no zone, or an unmapped one. */
export const FALLBACK_COUNTRY = "US";

/**
 * IANA zone → country, so the picker opens on the academy's own country
 * (`Europe/Lisbon` → Portugal) with no new column to store one in. One entry
 * per country plus the extra zones of the countries that span several; a zone
 * that is not here falls back rather than guessing.
 */
const ZONE_COUNTRY: Record<string, string> = {
  "Africa/Cairo": "EG",
  "Africa/Casablanca": "MA",
  "Africa/Johannesburg": "ZA",
  "Africa/Lagos": "NG",
  "Africa/Nairobi": "KE",
  "America/Anchorage": "US",
  "America/Argentina/Buenos_Aires": "AR",
  "America/Bahia": "BR",
  "America/Bogota": "CO",
  "America/Caracas": "VE",
  "America/Chicago": "US",
  "America/Costa_Rica": "CR",
  "America/Denver": "US",
  "America/Edmonton": "CA",
  "America/Fortaleza": "BR",
  "America/Guayaquil": "EC",
  "America/Halifax": "CA",
  "America/La_Paz": "BO",
  "America/Lima": "PE",
  "America/Los_Angeles": "US",
  "America/Manaus": "BR",
  "America/Mexico_City": "MX",
  "America/Montevideo": "UY",
  "America/New_York": "US",
  "America/Panama": "PA",
  "America/Phoenix": "US",
  "America/Recife": "BR",
  "America/Santiago": "CL",
  "America/Santo_Domingo": "DO",
  "America/Sao_Paulo": "BR",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Winnipeg": "CA",
  "Asia/Bangkok": "TH",
  "Asia/Dhaka": "BD",
  "Asia/Dubai": "AE",
  "Asia/Ho_Chi_Minh": "VN",
  "Asia/Jakarta": "ID",
  "Asia/Jerusalem": "IL",
  "Asia/Karachi": "PK",
  "Asia/Kolkata": "IN",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Manila": "PH",
  "Asia/Riyadh": "SA",
  "Asia/Seoul": "KR",
  "Asia/Shanghai": "CN",
  "Asia/Singapore": "SG",
  "Asia/Taipei": "TW",
  "Asia/Tokyo": "JP",
  "Atlantic/Azores": "PT",
  "Atlantic/Canary": "ES",
  "Atlantic/Madeira": "PT",
  "Atlantic/Reykjavik": "IS",
  "Australia/Brisbane": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Perth": "AU",
  "Australia/Sydney": "AU",
  "Europe/Amsterdam": "NL",
  "Europe/Athens": "GR",
  "Europe/Belgrade": "RS",
  "Europe/Berlin": "DE",
  "Europe/Bratislava": "SK",
  "Europe/Brussels": "BE",
  "Europe/Bucharest": "RO",
  "Europe/Budapest": "HU",
  "Europe/Copenhagen": "DK",
  "Europe/Dublin": "IE",
  "Europe/Helsinki": "FI",
  "Europe/Istanbul": "TR",
  "Europe/Kyiv": "UA",
  "Europe/Lisbon": "PT",
  "Europe/Ljubljana": "SI",
  "Europe/London": "GB",
  "Europe/Luxembourg": "LU",
  "Europe/Madrid": "ES",
  "Europe/Moscow": "RU",
  "Europe/Oslo": "NO",
  "Europe/Paris": "FR",
  "Europe/Prague": "CZ",
  "Europe/Riga": "LV",
  "Europe/Rome": "IT",
  "Europe/Sofia": "BG",
  "Europe/Stockholm": "SE",
  "Europe/Tallinn": "EE",
  "Europe/Vienna": "AT",
  "Europe/Vilnius": "LT",
  "Europe/Warsaw": "PL",
  "Europe/Zagreb": "HR",
  "Europe/Zurich": "CH",
  "Pacific/Auckland": "NZ",
  "Pacific/Honolulu": "US",
};

/** The country a form should open on, from the academy's zone. */
export function countryForZone(zone: string | null | undefined): string {
  if (!zone) return FALLBACK_COUNTRY;
  return ZONE_COUNTRY[zone] ?? FALLBACK_COUNTRY;
}

/**
 * The country a form should open on: the one the academy set, and only failing
 * that the one its time zone implies. The zone is a good guess and nothing
 * more, so an owner whose gym sits in a zone shared with another country (or
 * whose zone we do not map) can say so once in Settings instead of correcting
 * the picker on every form.
 */
export function academyCountry(
  country: string | null | undefined,
  zone: string | null | undefined,
): string {
  if (country && DIAL_COUNTRIES.some((c) => c.iso === country)) return country;
  return countryForZone(zone);
}

export function dialForCountry(iso: string): string {
  return DIAL_COUNTRIES.find((c) => c.iso === iso)?.dial ?? "+1";
}

/** E.164: a plus, a non-zero country digit, then 8 to 15 digits in total. */
export function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

/**
 * Join a country's prefix to what the person typed. A leading zero is the
 * national trunk prefix in most of Europe and is dropped from the
 * international form; Italian landlines are the known exception and keep
 * theirs, so an Italian fixed line has to be typed without it.
 */
export function toE164(dial: string, national: string): string {
  const digits = national.replace(/\D/g, "").replace(/^0+/, "");
  return digits ? `${dial}${digits}` : "";
}

/**
 * Split a stored number back into a country and the rest, for an edit form.
 * The longest matching prefix wins, so `+351` is not read as `+35`. A number
 * with no plus (rows written before this) keeps its digits in the national
 * box under the fallback country, rather than being silently re-homed.
 */
export function splitE164(
  value: string,
  fallbackIso: string,
): { iso: string; national: string } {
  if (value.startsWith("+")) {
    const matches = DIAL_COUNTRIES.filter((c) => value.startsWith(c.dial)).sort(
      (a, b) => b.dial.length - a.dial.length,
    );
    const hit = matches[0];
    if (hit) return { iso: hit.iso, national: value.slice(hit.dial.length) };
  }
  return { iso: fallbackIso, national: value.replace(/\D/g, "") };
}
