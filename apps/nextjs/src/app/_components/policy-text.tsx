import Link from "next/link";

import { FOCUS_RING } from "@matops/ui/motion";

import { CONTACT_EMAIL } from "./contact";

/**
 * The policy prose, in one place. The privacy page renders it as a page and the
 * public forms render it in a dialog, so a stranger reading it before they
 * consent and a person reading it later are reading the same words.
 *
 * No hooks and no client directive: it is rendered by a server page and by a
 * client dialog.
 */

export const PRIVACY_UPDATED = "30 September 2026";

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-foreground mt-6 mb-2 font-semibold first:mt-0">
      {children}
    </h3>
  );
}

export function PrivacyText() {
  return (
    <div className="text-foreground-secondary max-w-[58ch] leading-relaxed text-pretty">
      <Heading>Who is responsible</Heading>
      <p>
        Your academy decides what happens to its members&apos; data. MatOps
        stores it on the academy&apos;s behalf, so ask your academy first about
        your data. For questions about MatOps, write to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
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
          If you visit through the drop-in link without a membership: your name,
          email, phone, belt level, any health note you provided, whether you
          opted into news, and the classes you attended or booked. The gym can
          see these details; coaches see your health note only for classes you
          booked.
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
        its records. If you visit through the drop-in link, your information is
        kept as long as the academy keeps its records. When an academy deletes
        its MatOps account, all its data goes with it, including visitor
        information.
      </p>

      <Heading>Your rights</Heading>
      <p>
        Ask your academy for a copy, a correction or a deletion of your member
        data. For questions about data MatOps holds, write to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. In the EU or
        the UK you can also complain to your national data protection authority.
      </p>

      <Heading>Cookies</Heading>
      <ul className="list-disc space-y-1 pl-5">
        <li>One, to keep you signed in.</li>
        <li>
          One that remembers whether you accepted analytics cookies on the
          MatOps home page. It lasts six months, then we ask again.
        </li>
        <li>
          If you accept, Google Analytics sets its own cookies (named _ga) on
          the home page only. They count visits and show how people find MatOps.
          Google processes this data for us and keeps it for 14 months.
        </li>
        <li>
          If you decline, no analytics cookies are set. Google still gets an
          anonymous count of the visit, with no cookie and nothing that
          identifies you.
        </li>
      </ul>
      <p className="mt-2">
        Analytics never runs inside the app after you sign in. No advertising
        cookies. To change your choice, use Cookie settings at the bottom of the
        home page.
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
        className={`hover:text-foreground inline-flex min-h-11 items-center rounded-sm underline underline-offset-2 transition-colors motion-reduce:transition-none sm:min-h-0 ${FOCUS_RING}`}
      >
        Back to MatOps
      </Link>
    </p>
  );
}
