import type { Metadata } from "next";
import Link from "next/link";

import { cn } from "@matops/ui";
import { buttonClass } from "@matops/ui/button";

import { display } from "~/app/_components/auth-door";
import {
  CONTACT_EMAIL,
  PRICING_HREF,
  REQUEST_ACCESS_HREF,
} from "~/app/_components/contact";
import { SiteFooter, SiteHeader } from "~/app/_components/site-chrome";

const TITLE = "MatOps features: BJJ gym management software";
const DESCRIPTION =
  "What MatOps does for a BJJ academy: class schedule, student approvals, booking, attendance, belts, drop-in visitors and class change notices.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/features" },
  openGraph: {
    type: "website",
    url: "/features",
    siteName: "MatOps",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const FEATURES = [
  {
    title: "Class schedule",
    body: [
      "Build your week from class templates. MatOps fills the calendar six months ahead, and you can change or cancel a single class without touching the rest.",
      "Each discipline, like Gi, No-Gi or Kids, gets its own color. Print the week as a poster for the gym wall.",
    ],
  },
  {
    title: "Students and approvals",
    body: [
      "Students join with your invite link, its QR code, or a 6-digit join code. At sign-up they give their belt and stripes, can answer an optional health question, and accept your agreement if you require one.",
      "They see the schedule right away and can book once you approve them. Import your current student list from a CSV file, and export it any time.",
    ],
  },
  {
    title: "Booking",
    body: [
      "Approved students book and cancel classes up to seven days ahead, on their phone or on the web. Pending, suspended and archived students cannot book.",
      "Class size is a soft limit: you see when a class is over, and nobody is turned away at the door.",
    ],
  },
  {
    title: "Attendance and belts",
    body: [
      "Coaches mark who came to each class, and the dashboard shows classes that still need attendance.",
      "Record each student's belt and stripes, and keep coach notes on their training.",
    ],
  },
  {
    title: "Drop-in visitors",
    body: [
      "Share one drop-in link or its QR code. A visitor fills in a short form, then books a class coming up or marks themselves present at a class on now.",
      "Every visitor lands in your drop-in leads list, with their belt level and contact details.",
    ],
  },
  {
    title: "Class change notices",
    body: [
      "When you cancel or change a class, every student booked gets an email and a push notification. No group chat needed.",
    ],
  },
  {
    title: "Coaches",
    body: [
      "Invite coaches with their own link and approve them. Coaches see the schedule and students and take attendance. Academy settings stay with the owner and managers.",
    ],
  },
];

const LINK =
  "text-foreground decoration-muted-foreground rounded-sm underline underline-offset-4 hover:decoration-current";

export default function FeaturesPage() {
  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-12 pb-24 sm:px-6 sm:pt-20">
        <h1
          className={cn(
            display.className,
            "text-5xl leading-[1.02] tracking-[-0.01em] text-balance sm:text-6xl",
          )}
        >
          What MatOps does for your BJJ gym
        </h1>
        <p className="text-muted-foreground mt-5 max-w-xl text-lg leading-relaxed text-pretty">
          MatOps is gym management software built for Brazilian jiu-jitsu
          academies. Owners and coaches run the week on the web. Students book
          from their phone.
        </p>

        <div className="divide-border mt-14 divide-y">
          {FEATURES.map((f) => (
            <section key={f.title} className="py-8 first:pt-0">
              <h2 className="text-xl font-semibold">{f.title}</h2>
              {f.body.map((p) => (
                <p
                  key={p}
                  className="text-muted-foreground mt-3 max-w-[65ch] text-base leading-relaxed text-pretty"
                >
                  {p}
                </p>
              ))}
            </section>
          ))}
          <section className="py-8">
            <h2 className="text-xl font-semibold">Pricing</h2>
            <p className="text-muted-foreground mt-3 max-w-[65ch] text-base leading-relaxed text-pretty">
              Pricing depends on your academy. Email{" "}
              <a href={PRICING_HREF} className={LINK}>
                {CONTACT_EMAIL}
              </a>{" "}
              to ask for a price.
            </p>
          </section>
        </div>

        <div className="mt-10 flex flex-wrap gap-2">
          <a
            href={REQUEST_ACCESS_HREF}
            className={buttonClass({ variant: "primary", size: "lg" })}
          >
            Request access
          </a>
          <Link
            href="/sign-in"
            className={buttonClass({ variant: "secondary", size: "lg" })}
          >
            Sign in
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
