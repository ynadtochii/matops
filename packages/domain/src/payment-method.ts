export const PAYMENT_METHOD_KINDS = ["bank", "mbway", "cash", "other"] as const;

export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];

export const MAX_PAYMENT_METHODS = 10;

export const PAYMENT_METHOD_DEFAULT_LABEL: Record<PaymentMethodKind, string> = {
  bank: "Bank transfer",
  mbway: "MB WAY",
  cash: "Cash",
  other: "",
};

export function paymentMethodNeedsDetails(kind: PaymentMethodKind): boolean {
  return kind !== "cash";
}

export function paymentMethodUsesReference(kind: PaymentMethodKind): boolean {
  return kind !== "cash";
}
