import type { Metadata } from "next";
import Link from "next/link";

import { cn } from "@matops/ui";
import { buttonClass } from "@matops/ui/button";

import { display } from "~/app/_components/auth-door";
import { PRICING_HREF, REQUEST_DEMO_HREF } from "~/app/_components/contact";
import { SiteFooter, SiteHeader } from "~/app/_components/site-chrome";

const TITLE = "MatOps features: BJJ gym management software";
const DESCRIPTION =
  "What MatOps does for a BJJ academy: class schedule, students, booking and attendance.";

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
      "Build your week once and MatOps keeps the calendar filled. Change or cancel a single class without touching the rest.",
      "Group classes the way your academy runs them, and print the week for the gym wall.",
    ],
  },
  {
    title: "Students and approvals",
    body: [
      "Students join with your invite link or join code and tell you their belt when they sign up.",
      "They see the schedule right away and can book once you approve them. Bring your current student list with you.",
    ],
  },
  {
    title: "Booking",
    body: [
      "Approved students book and cancel classes on their phone or on the web.",
      "You see who is coming before class starts, and nobody is turned away at the door.",
    ],
  },
  {
    title: "Attendance and belts",
    body: [
      "Coaches mark who came to each class, and the dashboard shows what still needs attention.",
      "Keep each student's belt up to date, with notes on their training.",
    ],
  },
  {
    title: "Drop-in visitors",
    body: [
      "Share a drop-in link with visitors. They fill in a short form and book a class, and you see every visitor in one list.",
    ],
  },
  {
    title: "Class change notices",
    body: [
      "When you cancel or change a class, every student booked hears about it. No group chat needed.",
    ],
  },
  {
    title: "Coaches",
    body: [
      "Invite your coaches. They see the schedule and students and take attendance, while academy settings stay with you.",
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
              Pricing depends on your academy.{" "}
              <a href={PRICING_HREF} className={LINK}>
                Ask for a price
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-10 flex flex-wrap gap-2">
          <a
            href={REQUEST_DEMO_HREF}
            className={buttonClass({ variant: "primary", size: "lg" })}
          >
            Request a demo
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
