import type { MonthKey } from "./membership-month";

export function rowForMonth<T extends { effectiveMonth: MonthKey }>(
  history: readonly T[],
  month: MonthKey,
): T | null {
  let best: T | null = null;
  for (const row of history) {
    if (row.effectiveMonth > month) continue;
    if (!best || row.effectiveMonth > best.effectiveMonth) best = row;
  }
  return best;
}

export function paymentLinkReference(
  assignmentId: string,
  month: MonthKey,
): string {
  return `${assignmentId}_${month.slice(0, 7)}`;
}

export function cardPaymentUrl(
  link: string,
  input: { assignmentId: string; month: MonthKey; email?: string | null },
): string {
  const params = [
    `client_reference_id=${encodeURIComponent(
      paymentLinkReference(input.assignmentId, input.month),
    )}`,
  ];
  if (input.email) {
    params.push(`prefilled_email=${encodeURIComponent(input.email)}`);
  }
  return `${link}${link.includes("?") ? "&" : "?"}${params.join("&")}`;
}

const REFERENCE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_(\d{4})-(0[1-9]|1[0-2])$/;

export function parsePaymentLinkReference(
  reference: string | null | undefined,
): { assignmentId: string; month: MonthKey } | null {
  const match = reference ? REFERENCE.exec(reference) : null;
  if (!match?.[1] || !match[2] || !match[3]) return null;
  return { assignmentId: match[1], month: `${match[2]}-${match[3]}-01` };
}
