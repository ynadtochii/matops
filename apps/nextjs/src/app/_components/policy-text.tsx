import Link from "next/link";

import { env } from "~/env";

/**
 * The policy prose, in one place. The privacy page renders it as a page and the
 * public forms render it in a dialog, so a stranger reading it before they
 * consent and a person reading it later are reading the same words.
 *
 * No hooks and no client directive: it is rendered by a server page and by a
 * client dialog.
 */

export const PRIVACY_UPDATED = "30 August 2026";

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 mb-2 font-semibold tracking-tight first:mt-0">
      {children}
    </h3>
  );
}

export function PrivacyText() {
  return (
    <div className="text-muted-foreground max-w-[58ch] text-sm">
      <Heading>Who is responsible</Heading>
      <p>
        MatOps is run by <strong>{env.NEXT_PUBLIC_LEGAL_ENTITY}</strong>,{" "}
        {env.NEXT_PUBLIC_LEGAL_ADDRESS}. Write to{" "}
        <strong>{env.NEXT_PUBLIC_PRIVACY_CONTACT}</strong> for a copy of your
        data or to have it deleted. We answer within 30 days.
      </p>
      <p className="mt-2">
        Your academy decides what happens to its members&apos; data. MatOps
        stores it on the academy&apos;s behalf, so ask your academy first.
      </p>

      <Heading>What we store</Heading>
      <ul className="list-disc space-y-1 pl-5">
        <li>Your name, email and phone. The email is how you sign in.</li>
        <li>Your gym, your role there, your rank, and when you joined.</li>
        <li>
          The classes you book, cancel and attend, and notes your coaches write
          about your training.
        </li>
        <li>
          Whether your fee is paid. MatOps never sees a card number: dues are
          paid by bank transfer, outside MatOps.
        </li>
        <li>
          If you check in as a visitor: your name, phone, email, and that you
          agreed to be contacted.
        </li>
      </ul>

      <Heading>Why we store it</Heading>
      <p>
        To run the academy: the timetable, bookings, the register, rank, and who
        has paid. No advertising, no tracking you across other websites, and
        nothing is sold.
      </p>

      <Heading>Who else can see it</Heading>
      <p>
        Your academy&apos;s owner sees your full record. An instructor sees the
        roster, attendance and rank, but not payment figures. Other students see
        only who is booked into the same class. No academy can see another
        academy&apos;s data: the database enforces that, not just the app.
      </p>
      <p className="mt-2">
        Your data is stored in the EU. The companies that host MatOps and send
        its email process it on our instructions and nothing more.
      </p>

      <Heading>How long we keep it</Heading>
      <p>
        While you are a member, and afterwards for as long as your academy keeps
        its records. When an academy deletes its MatOps account, its data goes
        with it.
      </p>

      <Heading>Your rights</Heading>
      <p>
        Ask for a copy, a correction or a deletion:{" "}
        <strong>{env.NEXT_PUBLIC_PRIVACY_CONTACT}</strong>. In the EU or the UK
        you can also complain to your national data protection authority.
      </p>

      <Heading>Cookies</Heading>
      <p>One, to keep you signed in. No advertising or analytics cookies.</p>
    </div>
  );
}

/**
 * The training risk notice. Grappling is full contact, so someone stepping onto
 * the mat for the first time is told what that means before they tick the box,
 * not after. The academy is named because the limit of liability is the
 * academy's, not matops'.
 */
export function RiskText({ academyName }: { academyName: string }) {
  const gym = academyName.trim() === "" ? "The academy" : academyName;
  return (
    <div className="text-muted-foreground flex max-w-[58ch] flex-col gap-3 text-sm">
      <p>
        Brazilian Jiu-Jitsu is a full-contact martial art involving physical
        contact, grappling and sparring. Participation carries an inherent risk
        of injury.
      </p>
      <p>
        You agree to train within your limits, to tap out immediately when
        required, and to tell your coach about any relevant injuries or medical
        conditions before class.
      </p>
      <p>
        {gym} and its coaches accept no liability for injuries sustained during
        training, except in cases of negligence.
      </p>
      <p>
        This is not the gym&apos;s waiver. You sign that at the desk before your
        first session.
      </p>
    </div>
  );
}

/** The footer link back out of the standalone privacy page. */
export function BackToMatops() {
  return (
    <p className="text-muted-foreground mt-10 text-sm">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center underline underline-offset-2 sm:min-h-0"
      >
        Back to MatOps
      </Link>
    </p>
  );
}
