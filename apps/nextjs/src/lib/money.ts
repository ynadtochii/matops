/**
 * Format money stored as an integer in the currency's MINOR unit (ADR 40).
 * v1.3 assumes a 2-decimal currency (÷100); multi-currency exactness is parked.
 */
export function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}
