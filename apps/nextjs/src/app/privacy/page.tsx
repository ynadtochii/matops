import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@matops/ui/logo";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What matops stores about you, why, and how to get it removed.",
};

const UPDATED = "22 August 2026";

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-10 mb-2 text-lg font-semibold tracking-tight">
      {children}
    </h2>
  );
}

export default function PrivacyPage() {
  return (
    <main className="container flex min-h-screen flex-col items-start gap-6 py-16">
      <Link href="/">
        <Logo size={26} />
      </Link>

      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">
          Privacy at matops
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Last updated {UPDATED}. Written in plain English on purpose.
        </p>

        <Heading>Who is responsible</Heading>
        <p className="text-muted-foreground text-sm">
          matops is run by <strong>[ENTITY]</strong>, [ADDRESS]. Questions,
          copies of your data, or deletion requests go to{" "}
          <strong>[CONTACT EMAIL]</strong> and are answered within 30 days.
        </p>
        <p className="text-muted-foreground mt-2 text-sm">
          Your academy decides what to do with its members&apos; data. matops
          stores and processes it on the academy&apos;s behalf. If you want your
          record removed, ask your academy first, or write to us and we will
          pass it on.
        </p>

        <Heading>What we store</Heading>
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
          <li>
            Your name, email address, and phone number if you give one. The
            email is how you sign in.
          </li>
          <li>
            Which academy you belong to, your role there, your rank, and when
            you joined.
          </li>
          <li>
            The classes you book, cancel, and attend, and any notes your coaches
            write about your training.
          </li>
          <li>
            Whether your membership fee is paid. matops never sees a card
            number: payment happens by bank transfer, outside matops.
          </li>
          <li>
            If you check in as a visitor from the gym QR poster: your name,
            phone, email, and that you consented to be contacted.
          </li>
        </ul>

        <Heading>Why we store it</Heading>
        <p className="text-muted-foreground text-sm">
          To run the academy: to show the timetable, to let you book a place, to
          take the register, to track rank, and to tell the owner who has paid.
          There is no advertising and no tracking of you across other websites.
          We do not sell data to anyone.
        </p>

        <Heading>Who else can see it</Heading>
        <p className="text-muted-foreground text-sm">
          Your academy&apos;s owner sees your full record. An instructor at your
          academy sees the roster, attendance, and rank, but not payment
          figures. Other students see only the names of people booked into the
          same class. No academy can see another academy&apos;s data: the
          database enforces that, not just the app.
        </p>
        <p className="text-muted-foreground mt-2 text-sm">
          Companies that run parts of matops for us: Neon (the database, in the
          EU), Vercel (hosting), Resend (sign-in emails), Sentry (error reports,
          in the EU), Expo (push notifications to the phone app), and Google
          (only if you choose to sign in with Google). They process data on our
          instructions and nothing more.
        </p>

        <Heading>How long we keep it</Heading>
        <p className="text-muted-foreground text-sm">
          While you are a member, and after you leave for as long as your
          academy keeps its records, so the gym&apos;s history stays intact.
          Error reports are deleted after 30 days. When an academy deletes its
          matops account, its data goes with it.
        </p>

        <Heading>Your rights</Heading>
        <p className="text-muted-foreground text-sm">
          You can ask for a copy of your data, ask us to correct it, ask us to
          delete it, or object to how it is used. Write to{" "}
          <strong>[CONTACT EMAIL]</strong>. If you are in the EU or the UK and
          you are not happy with our answer, you can complain to your national
          data protection authority.
        </p>

        <Heading>Cookies</Heading>
        <p className="text-muted-foreground text-sm">
          One cookie, to keep you signed in. No advertising cookies and no
          analytics cookies.
        </p>

        <p className="text-muted-foreground mt-10 text-sm">
          <Link href="/" className="underline underline-offset-2">
            Back to matops
          </Link>
        </p>
      </div>
    </main>
  );
}
