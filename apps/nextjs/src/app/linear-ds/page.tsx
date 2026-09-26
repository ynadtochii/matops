import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { LinearDsScreen } from "./linear-ds-screen";

export const metadata: Metadata = {
  title: "Linear design system",
  robots: { index: false, follow: false },
};

const THEME_KEY = "linear-ds-theme";

const inter = Inter({ subsets: ["latin"], variable: "--font-lds" });

export default function LinearDsPage() {
  return (
    <div className={inter.variable}>
      <LinearDsScreen />
      <script
        dangerouslySetInnerHTML={{
          __html: `try{if(localStorage.getItem("${THEME_KEY}")==="light")document.querySelector("[data-lds]").dataset.theme="light"}catch(e){}`,
        }}
      />
    </div>
  );
}
