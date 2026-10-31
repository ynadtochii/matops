import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  CreditCard,
  Landmark,
  Smartphone,
  Wallet,
} from "lucide-react";

import type { PaymentMethodKind } from "@matops/domain";

export const CARD = "card";

export const METHOD_ICONS: Record<PaymentMethodKind | typeof CARD, LucideIcon> =
  {
    card: CreditCard,
    bank: Landmark,
    mbway: Smartphone,
    cash: Banknote,
    other: Wallet,
  };
