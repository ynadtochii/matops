export const CONSENT_COOKIE = "matops_consent";
export const CONSENT_VERSION = "1";
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 182;
export const CONSENT_OPEN_EVENT = "matops:consent-open";

export type Consent = "granted" | "denied";

export function parseConsent(raw: string | undefined): Consent | null {
  const [value, version] = raw?.split(".") ?? [];
  if (version !== CONSENT_VERSION) return null;
  return value === "granted" || value === "denied" ? value : null;
}

export function consentCookie(value: Consent, now: Date, secure: boolean) {
  const stamp = now.toISOString().slice(0, 10);
  return [
    `${CONSENT_COOKIE}=${value}.${CONSENT_VERSION}.${stamp}`,
    `Max-Age=${CONSENT_MAX_AGE}`,
    "Path=/",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function consentDefaultScript(consent: Consent | null) {
  const analytics = consent === "granted" ? "granted" : "denied";
  return `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("consent","default",{analytics_storage:"${analytics}",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied"});`;
}
