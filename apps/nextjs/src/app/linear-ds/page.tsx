import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { LinearDsScreen } from "./linear-ds-screen";

export const metadata: Metadata = {
  title: "Linear design system",
  robots: { index: false, follow: false },
};

const inter = Inter({ subsets: ["latin"], variable: "--font-lds" });

export default function LinearDsPage() {
  return (
    <div className={inter.variable}>
      <LinearDsScreen />
    </div>
  );
}
