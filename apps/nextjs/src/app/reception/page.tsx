import type { Metadata } from "next";

import { ReceptionGate } from "./reception-gate";

export const metadata: Metadata = {
  title: "Reception",
  robots: { index: false, follow: false },
};

export default function ReceptionPage() {
  return <ReceptionGate />;
}
