import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@matops/ui/logo";
import { FOCUS_RING } from "@matops/ui/motion";

import {
  BackToMatops,
  PRIVACY_UPDATED,
  PrivacyText,
} from "../_components/policy-text";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What MatOps stores about you, why, and how to get it removed.",
};

export default function PrivacyPage() {
  return (
    <main className="container flex min-h-screen flex-col items-start gap-6 py-16">
      <Link
        href="/"
        className={`inline-flex min-h-11 items-center rounded-md sm:min-h-0 ${FOCUS_RING}`}
      >
        <Logo size={26} />
      </Link>

      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">
          Privacy at MatOps
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Last updated {PRIVACY_UPDATED}. Written in plain English on purpose.
        </p>

        <div className="mt-8 text-base">
          <PrivacyText />
        </div>

        <BackToMatops />
      </div>
    </main>
  );
}
