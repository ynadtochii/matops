export function paymentReference(name: string, memberId: string): string {
  const cleanName = name.trim().replace(/\s+/g, " ").toUpperCase();
  const shortId = memberId
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-4)
    .toUpperCase();
  return [cleanName, shortId].filter(Boolean).join(" ");
}

export function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}
