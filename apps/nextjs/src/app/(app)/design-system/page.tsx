import type { Metadata } from "next";

import { DesignSystemScreen } from "./design-system-screen";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

export default function DesignSystemPage() {
  return <DesignSystemScreen />;
}
