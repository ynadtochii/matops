/**
 * Pure seed-data builders. NO I/O, NO clock reading, NO db — every row is a plain
 * value object, so the whole dataset is unit-testable and deterministic given a
 * fixed `now` + id generator (see seed/data.test.ts). The IO layer (run.ts) takes
 * these arrays and writes them.
 *
 * ONE demo academy ("Alma beta"), owned by the real user, built for the beta
 * test: an outside tester joins through the seeded instructor invite link.
 *
 * The academy runs on SHARED memberships (ADR 126-129), the way every branch
 * made today does — not on the legacy branch dues, which only a gym that
 * predates the cutover still has.
 *
 * The dataset is shaped to light up EVERY UI state at least once: member
 * statuses (active / pending / suspended / archived / removed), a manager who
 * runs the gym without training at it, all four drift bands (active / cooling /
 * at risk / dormant), the membership month on all four answers (paid / silent /
 * reminded / claimed) plus somebody with no membership at all, a plan change
 * waiting for the 1st, an archived plan, attendance history (present / absent /
 * unmarked / walk-in), one-off and cancelled classes, all five disciplines,
 * belts across disciplines with a promotion timeline, drop-in leads across the
 * funnel, referrals in all three audit states, and a live invite link per role.
 */
import {
  computeOccurrences,
  monthOf,
  nextMonth,
  paymentPeriod,
} from "@matops/domain";

import type {
  academyInvite,
  academyProfile,
  accessAssignment,
  accessAssignmentChange,
  accessPlan,
  accessPlanEntity,
  accessPlanPrice,
  classInstance,
  classParticipation,
  classTemplate,
  dropIn,
  dropInVisit,
  entity,
  entityMembership,
  member,
  memberNote,
  memberRank,
  memberReferral,
  memberReferralAudit,
  membershipMonth,
  membershipMonthAudit,
  membershipPlan,
  membershipPolicy,
  membershipPurchase,
  organization,
  paymentClaim,
  rankPromotion,
  user,
} from "../schema";
import type { SeedAcademy } from "./registry";
import {
  SEED_ACADEMY,
  seedEntityMembershipId,
  seedMemberId,
  seedMembershipId,
  seedUserId,
} from "./registry";

type NewUser = typeof user.$inferInsert;
type NewOrganization = typeof organization.$inferInsert;
type NewMember = typeof member.$inferInsert;
type NewEntity = typeof entity.$inferInsert;
type NewAcademyProfile = typeof academyProfile.$inferInsert;
type NewEntityMembership = typeof entityMembership.$inferInsert;
type NewInvite = typeof academyInvite.$inferInsert;
type NewTemplate = typeof classTemplate.$inferInsert;
type NewClass = typeof classInstance.$inferInsert;
type NewParticipation = typeof classParticipation.$inferInsert;
type NewPlan = typeof membershipPlan.$inferInsert;
type NewClaim = typeof paymentClaim.$inferInsert;
type NewAccessPlan = typeof accessPlan.$inferInsert;
type NewAccessPlanPrice = typeof accessPlanPrice.$inferInsert;
type NewAccessPlanEntity = typeof accessPlanEntity.$inferInsert;
type NewPolicy = typeof membershipPolicy.$inferInsert;
type NewAssignment = typeof accessAssignment.$inferInsert;
type NewAssignmentChange = typeof accessAssignmentChange.$inferInsert;
type NewMembershipMonth = typeof membershipMonth.$inferInsert;
type NewMembershipMonthAudit = typeof membershipMonthAudit.$inferInsert;
type NewPurchase = typeof membershipPurchase.$inferInsert;
type NewRank = typeof memberRank.$inferInsert;
type NewPromotion = typeof rankPromotion.$inferInsert;
type NewNote = typeof memberNote.$inferInsert;
type NewDropIn = typeof dropIn.$inferInsert;
type NewDropInVisit = typeof dropInVisit.$inferInsert;
type NewReferral = typeof memberReferral.$inferInsert;
type NewReferralAudit = typeof memberReferralAudit.$inferInsert;

/** Everything the seed inserts, grouped by table. Future (materialized) classes
 * and their bookings are NOT here — run.ts adds those after materialization,
 * because their class ids are database-generated. */
export interface SeedGraph {
  users: NewUser[];
  organizations: NewOrganization[];
  members: NewMember[];
  entities: NewEntity[];
  academyProfiles: NewAcademyProfile[];
  entityMemberships: NewEntityMembership[];
  invites: NewInvite[];
  templates: NewTemplate[];
  pastClasses: NewClass[];
  participations: NewParticipation[];
  plans: NewPlan[];
  claims: NewClaim[];
  memberships: MembershipRows;
  ranks: NewRank[];
  promotions: NewPromotion[];
  notes: NewNote[];
  dropIns: NewDropIn[];
  dropInVisits: NewDropInVisit[];
  referrals: NewReferral[];
  referralAudits: NewReferralAudit[];
  /** Active students who stopped training — run.ts leaves them out of future
   * bookings so their drift band is not contradicted by a booking tomorrow. */
  quietStudentIds: string[];
}

export interface SeedGraphOptions {
  /** The real, already-registered user you sign in as (the academy owner). */
  realUser: { id: string; name: string };
  /** Injected id generator for uuid PKs — pass a counter in tests for determinism. */
  newId: () => string;
  /** "Now" — injected so the dataset is deterministic (default: real now). */
  now?: Date;
  academy?: SeedAcademy;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far back past classes go (attendance history for streaks + insights).
 * Six weeks, so a member who stopped a month ago still has visible history and
 * lands in the `dormant` drift band rather than looking like a never-joiner. */
const PAST_WINDOW_DAYS = 42;

const FIRST_NAMES = [
  "Sam",
  "Alex",
  "Jordan",
  "Casey",
  "Riley",
  "Taylor",
  "Morgan",
  "Jamie",
  "Drew",
  "Quinn",
  "Avery",
  "Reese",
  "Skyler",
  "Cameron",
  "Rowan",
  "Emerson",
  "Finley",
  "Hayden",
  "Kai",
  "Lennox",
  "Marlow",
  "Nico",
];
const LAST_NAMES = [
  "Silva",
  "Nguyen",
  "Kowalski",
  "Okafor",
  "Rossi",
  "Haddad",
  "Novak",
  "Costa",
  "Fischer",
  "Dubois",
  "Ivanov",
  "Popescu",
  "Andersen",
  "Reyes",
  "Bauer",
  "Moreau",
  "Larsen",
  "Kovac",
  "Weber",
  "Sato",
  "Mensah",
  "Petrov",
];

function personName(seed: number): string {
  const first = FIRST_NAMES[seed % FIRST_NAMES.length];
  const last = LAST_NAMES[(seed * 7) % LAST_NAMES.length];
  return `${first} ${last}`;
}

/** A fake persona (user + the id helpers) used to build member/participation rows. */
interface Persona {
  handle: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
}

function persona(handle: string, seed: number, fixedName?: string): Persona {
  const name = fixedName ?? personName(seed);
  return {
    handle,
    userId: seedUserId(handle),
    name,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}${seed}@example.com`,
    phone: `+38050${String(1000000 + seed).slice(-7)}`,
  };
}

function userRow(p: Persona): NewUser {
  return {
    id: p.userId,
    name: p.name,
    email: p.email,
    emailVerified: true,
    phone: p.phone,
  };
}

/** A weekly template spec (local wall-clock), before it gets an id + academy. */
interface TemplateSpec {
  title: string;
  discipline: NewTemplate["discipline"];
  daysOfWeek: number[];
  startsAtMinutes: number;
  durationMinutes: number;
  capacity: number;
  /** Which persona/user teaches it. */
  instructorId: string;
  status?: NewTemplate["status"];
}

/**
 * One seeded membership: the persona plus the member row's state. `quietSince`
 * drives the drift band — `undefined` trains right up to today, a number stops
 * attending that many days ago, `null` never attended at all.
 */
export interface StudentDef {
  persona: Persona;
  status: string;
  role: string;
  invitedRole: string | null;
  quietSince?: number | null;
}

/**
 * Build the academy's domain slice. `staffInstructorId` is the real user (the
 * owner): they teach the Open Mat and stamp every attendance mark, rank, and
 * note. `students` are the members whose attendance/dues/rank data populates the
 * screens.
 */
function buildAcademy(args: {
  academy: SeedAcademy;
  templates: TemplateSpec[];
  students: StudentDef[];
  /** Staff member ids that get a black-belt rank row (the coaches). */
  staffRanks?: { memberHandle: string; belt: string }[];
  staffInstructorId: string;
  newId: () => string;
  now: Date;
}): {
  templates: NewTemplate[];
  pastClasses: NewClass[];
  participations: NewParticipation[];
  plans: NewPlan[];
  claims: NewClaim[];
  memberships: MembershipRows;
  ranks: NewRank[];
  promotions: NewPromotion[];
  notes: NewNote[];
  dropIns: NewDropIn[];
  dropInVisits: NewDropInVisit[];
} {
  const { academy, students, staffInstructorId, newId, now } = args;
  const from = new Date(now.getTime() - PAST_WINDOW_DAYS * DAY_MS);

  // --- Templates + their PAST concrete classes (future ones come from the
  //     materializer in run.ts, which fills [now, horizon)). -------------------
  const templates: NewTemplate[] = [];
  const pastClasses: NewClass[] = [];
  const participations: NewParticipation[] = [];

  // Only ACTIVE students book/attend; keep a stable list for the round-robin.
  const activeStudents = students.filter((s) => s.status === "active");

  args.templates.forEach((spec, ti) => {
    const templateId = newId();
    templates.push({
      id: templateId,
      academyId: academy.id,
      instructorId: spec.instructorId,
      title: spec.title,
      discipline: spec.discipline,
      daysOfWeek: spec.daysOfWeek,
      startsAtMinutes: spec.startsAtMinutes,
      durationMinutes: spec.durationMinutes,
      timeZone: academy.timeZone,
      capacity: spec.capacity,
      status: spec.status ?? "active",
      // Cursor left null so materializeTemplate fills [now, horizon) with NO
      // overlap against the past classes we insert here.
      generatedUntil: null,
    });

    const occurrences = computeOccurrences(
      {
        daysOfWeek: spec.daysOfWeek,
        startsAtMinutes: spec.startsAtMinutes,
        timeZone: academy.timeZone,
      },
      from,
      now,
    );

    occurrences.forEach((startsAt, oi) => {
      const classId = newId();
      // A deterministic subset of active students attend each past class.
      const attendees = activeStudents.filter((s, si) => {
        if ((si + ti + oi) % 3 === 0) return false;
        if (s.quietSince === undefined) return true;
        if (s.quietSince === null) return false;
        return startsAt.getTime() <= now.getTime() - s.quietSince * DAY_MS;
      });
      // The latest class of the second template is left UNMARKED, so the owner
      // has a past class to run "mark all present" on in a demo.
      const unmarked = ti === 1 && oi === occurrences.length - 1;
      let bookingCount = 0;
      attendees.forEach((s, ai) => {
        // ~1 in 5 booked-but-absent; the rest present → realistic attendance %.
        const present = !unmarked && (ai + oi) % 5 !== 0;
        bookingCount += 1;
        participations.push({
          id: newId(),
          academyId: academy.id,
          classId,
          studentId: s.persona.userId,
          bookingStatus: "booked",
          bookingTier: "confirmed",
          bookedAt: new Date(startsAt.getTime() - DAY_MS),
          attendanceStatus: unmarked
            ? "unmarked"
            : present
              ? "present"
              : "absent",
          attendedAt: present ? startsAt : null,
          markedBy: present ? staffInstructorId : null,
        });
      });
      // Every 4th class keeps a cancelled booking (student booked, then bailed).
      const quitter = activeStudents.find((_, si) => (si + ti + oi) % 3 === 0);
      if (oi % 4 === 0 && quitter) {
        participations.push({
          id: newId(),
          academyId: academy.id,
          classId,
          studentId: quitter.persona.userId,
          bookingStatus: "cancelled",
          bookingTier: "confirmed",
          bookedAt: new Date(startsAt.getTime() - 2 * DAY_MS),
          cancelledAt: new Date(startsAt.getTime() - DAY_MS),
          attendanceStatus: "unmarked",
        });
      }
      // One walk-in on the most recent class of the first template (booking
      // `none` + present) so the O5 walk-in path has data.
      const walkIn = [...activeStudents]
        .reverse()
        .find((s) => s.quietSince === undefined);
      if (ti === 0 && oi === occurrences.length - 1 && walkIn) {
        participations.push({
          id: newId(),
          academyId: academy.id,
          classId,
          studentId: walkIn.persona.userId,
          bookingStatus: "none",
          bookingTier: "confirmed",
          bookedAt: startsAt,
          attendanceStatus: "present",
          attendedAt: startsAt,
          markedBy: staffInstructorId,
        });
      }
      pastClasses.push({
        id: classId,
        academyId: academy.id,
        templateId,
        instructorId: spec.instructorId,
        title: spec.title,
        discipline: spec.discipline,
        startsAt,
        durationMinutes: spec.durationMinutes,
        capacity: spec.capacity,
        bookingCount,
        status: "scheduled",
      });
    });
  });

  // --- One-off classes (template_id null) + a cancelled past class. ---------
  // A seminar the owner added by hand, once in the past (with attendance) and
  // once upcoming; plus a class that was called off, so the cancelled state and
  // the coach's "cancelled" count both have data.
  const regulars = activeStudents.filter((s) => s.quietSince === undefined);
  const pastSeminarId = newId();
  const pastSeminarStart = new Date(now.getTime() - 9 * DAY_MS);
  pastClasses.push({
    id: pastSeminarId,
    academyId: academy.id,
    templateId: null,
    instructorId: staffInstructorId,
    title: "Seminar · Guard passing",
    discipline: "bjj",
    startsAt: pastSeminarStart,
    durationMinutes: 120,
    capacity: 30,
    bookingCount: Math.min(regulars.length, 8),
    status: "scheduled",
  });
  regulars.slice(0, 8).forEach((s, i) => {
    participations.push({
      id: newId(),
      academyId: academy.id,
      classId: pastSeminarId,
      studentId: s.persona.userId,
      bookingStatus: "booked",
      bookingTier: "confirmed",
      bookedAt: new Date(pastSeminarStart.getTime() - 3 * DAY_MS),
      attendanceStatus: i === 7 ? "absent" : "present",
      attendedAt: i === 7 ? null : pastSeminarStart,
      markedBy: i === 7 ? null : staffInstructorId,
    });
  });

  const upcomingSeminarId = newId();
  pastClasses.push({
    id: upcomingSeminarId,
    academyId: academy.id,
    templateId: null,
    instructorId: args.templates[0]?.instructorId ?? staffInstructorId,
    title: "Seminar · Leg locks",
    discipline: "nogi",
    startsAt: new Date(now.getTime() + 6 * DAY_MS),
    durationMinutes: 120,
    capacity: 30,
    bookingCount: 0,
    status: "scheduled",
  });

  const cancelledPastId = newId();
  const cancelledPastStart = new Date(now.getTime() - 3 * DAY_MS);
  pastClasses.push({
    id: cancelledPastId,
    academyId: academy.id,
    templateId: null,
    instructorId: args.templates[0]?.instructorId ?? staffInstructorId,
    title: "NoGi · All levels",
    discipline: "nogi",
    startsAt: cancelledPastStart,
    durationMinutes: 60,
    capacity: 20,
    bookingCount: 0,
    status: "cancelled",
  });
  regulars.slice(0, 4).forEach((s) => {
    participations.push({
      id: newId(),
      academyId: academy.id,
      classId: cancelledPastId,
      studentId: s.persona.userId,
      bookingStatus: "booked",
      bookingTier: "confirmed",
      bookedAt: new Date(cancelledPastStart.getTime() - 2 * DAY_MS),
      attendanceStatus: "unmarked",
    });
  });

  // --- Payments: the shared membership stack (ADR 126-129). ------------------
  // The academy runs the membership gate, so there are no branch dues rows.
  // The legacy price list and its CONFIRMED claims stay because the referrals
  // ledger (O9) still reads revenue off `payment_claim` and nothing else.
  const planId = newId();
  const planLiteId = newId();
  const planArchivedId = newId();
  const legacyPlans: NewPlan[] = [
    {
      id: planId,
      academyId: academy.id,
      name: "Monthly Unlimited",
      priceMinor: 5000,
      currency: academy.currency,
      cycle: "monthly",
    },
    {
      id: planLiteId,
      academyId: academy.id,
      name: "Monthly · 2× / week",
      priceMinor: 3500,
      currency: academy.currency,
      cycle: "monthly",
    },
    {
      id: planArchivedId,
      academyId: academy.id,
      name: "Legacy · Unlimited",
      priceMinor: 4200,
      currency: academy.currency,
      cycle: "monthly",
      deletedAt: new Date(now.getTime() - 60 * DAY_MS),
    },
  ];

  const claims: NewClaim[] = [];
  activeStudents.slice(0, 8).forEach((student, index) => {
    const lite = index % 3 === 0;
    const selected = legacyPlans[lite ? 1 : 0];
    if (!selected) return;
    const memberId = seedMembershipId(academy.key, student.persona.handle);
    claims.push(
      {
        id: newId(),
        academyId: academy.id,
        memberId,
        planId: selected.id ?? planId,
        amountMinor: selected.priceMinor,
        currency: selected.currency,
        period: paymentPeriod(now),
        status: "confirmed",
        confirmedBy: staffInstructorId,
        confirmedAt: now,
        claimedAt: new Date(now.getTime() - DAY_MS),
      },
      {
        id: newId(),
        academyId: academy.id,
        memberId,
        planId: selected.id ?? planId,
        amountMinor: selected.priceMinor,
        currency: selected.currency,
        period: paymentPeriod(new Date(now.getTime() - 45 * DAY_MS)),
        status: "confirmed",
        confirmedBy: staffInstructorId,
        confirmedAt: new Date(now.getTime() - 45 * DAY_MS),
        claimedAt: new Date(now.getTime() - 46 * DAY_MS),
      },
    );
  });

  const memberships = buildMemberships({
    academy,
    students,
    ownerUserId: staffInstructorId,
    newId,
    now,
  });

  // --- Ranks: belts across the ladder + a promotion timeline + a couple notes. -
  const belts = ["White", "White", "Blue", "Blue", "Purple", "Brown"];
  const ranks: NewRank[] = [];
  const promotions: NewPromotion[] = [];
  activeStudents.forEach((s, i) => {
    const belt = belts[i % belts.length] ?? "White";
    const stripes = i % 4;
    ranks.push({
      id: newId(),
      academyId: academy.id,
      memberId: seedMembershipId(academy.key, s.persona.handle),
      discipline: "bjj",
      belt,
      stripes,
      updatedBy: staffInstructorId,
    });
    // First grant (White) for everyone; a real promotion for the higher belts.
    promotions.push({
      id: newId(),
      academyId: academy.id,
      memberId: seedMembershipId(academy.key, s.persona.handle),
      discipline: "bjj",
      fromBelt: null,
      fromStripes: null,
      toBelt: "White",
      toStripes: 0,
      promotedBy: staffInstructorId,
      promotedAt: new Date(now.getTime() - 300 * DAY_MS),
    });
    if (belt !== "White") {
      promotions.push({
        id: newId(),
        academyId: academy.id,
        memberId: seedMembershipId(academy.key, s.persona.handle),
        discipline: "bjj",
        fromBelt: "White",
        fromStripes: 4,
        toBelt: belt,
        toStripes: stripes,
        promotedBy: staffInstructorId,
        promotedAt: new Date(now.getTime() - 30 * DAY_MS),
      });
    }
  });
  // The coaches carry their own belts — the member detail of a staff member
  // must not read as blank.
  (args.staffRanks ?? []).forEach((r) => {
    ranks.push({
      id: newId(),
      academyId: academy.id,
      memberId: seedMembershipId(academy.key, r.memberHandle),
      discipline: "bjj",
      belt: r.belt,
      stripes: 0,
      updatedBy: staffInstructorId,
    });
    promotions.push({
      id: newId(),
      academyId: academy.id,
      memberId: seedMembershipId(academy.key, r.memberHandle),
      discipline: "bjj",
      fromBelt: "Brown",
      fromStripes: 4,
      toBelt: r.belt,
      toStripes: 0,
      promotedBy: staffInstructorId,
      promotedAt: new Date(now.getTime() - 700 * DAY_MS),
    });
  });

  // A judo rank on one member proves the second (no-stripe) system renders.
  if (activeStudents[0]) {
    ranks.push({
      id: newId(),
      academyId: academy.id,
      memberId: seedMembershipId(academy.key, activeStudents[0].persona.handle),
      discipline: "judo",
      belt: "Green",
      stripes: 0,
      updatedBy: staffInstructorId,
    });
  }

  const NOTE_BODIES = [
    "Recovering from a knee tweak. Go easy on leg locks for two weeks.",
    "Cleared by the physio today. Back to full rounds.",
    "Prepping for first competition next month, keen on extra rounds.",
    "Asked about the kids class for their son (age 8).",
    "Paid in cash at the desk on the 3rd, receipt in the folder.",
  ];
  // Member 0 gets a two-note history (the thread reads as a timeline); the next
  // three get one each, so the empty-notes state still shows on everyone else.
  const noteTargets = [0, 0, 1, 2, 3];
  const notes: NewNote[] = [];
  noteTargets.forEach((studentIndex, i) => {
    const s = activeStudents[studentIndex];
    if (!s) return;
    notes.push({
      id: newId(),
      academyId: academy.id,
      memberId: seedMembershipId(academy.key, s.persona.handle),
      body: NOTE_BODIES[i] ?? "",
      authorId: staffInstructorId,
      createdAt: new Date(now.getTime() - (20 - i * 3) * DAY_MS),
    });
  });

  // --- Drop-in leads (public QR form) for the owner's O4 leads list. ----------
  const danaLeadId = newId();
  const dropIns: NewDropIn[] = [
    {
      id: newId(),
      academyId: academy.id,
      firstName: "Pat",
      lastName: "Visitor",
      phone: "+380509998877",
      email: "pat.visitor@example.com",
      consent: true,
    },
    {
      id: newId(),
      academyId: academy.id,
      firstName: "Robin",
      lastName: "Trial",
      phone: "+380509998866",
      email: null,
      consent: true,
      stage: "contacted",
      source: "link",
      contactedAt: new Date(now.getTime() - 4 * DAY_MS),
    },
    {
      // Walked into a specific class — shows on that class's O5 roster.
      id: danaLeadId,
      academyId: academy.id,
      firstName: "Dana",
      lastName: "Guest",
      phone: "+380509998855",
      email: "dana.guest@example.com",
      consent: true,
      stage: "invited",
      source: "staff",
      contactedAt: new Date(pastSeminarStart.getTime() + DAY_MS),
      firstVisitAt: pastSeminarStart,
      lastVisitAt: pastSeminarStart,
    },
    {
      // Did not consent to being contacted — the lead list must not offer to
      // chase this one.
      id: newId(),
      academyId: academy.id,
      firstName: "Lee",
      lastName: "Onceoff",
      phone: "+380509998844",
      email: null,
      consent: false,
      stage: "ghosted",
      source: "web",
      firstVisitAt: new Date(now.getTime() - 50 * DAY_MS),
      lastVisitAt: new Date(now.getTime() - 5 * DAY_MS),
    },
  ];

  const dropInVisits: NewDropInVisit[] = [
    {
      id: newId(),
      academyId: academy.id,
      dropInId: danaLeadId,
      classId: pastSeminarId,
      bookingStatus: "none",
      attendanceStatus: "present",
      attendedAt: pastSeminarStart,
    },
  ];

  return {
    templates,
    pastClasses,
    participations,
    plans: legacyPlans,
    claims,
    memberships,
    ranks,
    promotions,
    notes,
    dropIns,
    dropInVisits,
  };
}


/** The organization-scoped membership rows one seeded academy carries. */
export interface MembershipRows {
  policies: NewPolicy[];
  plans: NewAccessPlan[];
  planPrices: NewAccessPlanPrice[];
  planEntities: NewAccessPlanEntity[];
  assignments: NewAssignment[];
  changes: NewAssignmentChange[];
  months: NewMembershipMonth[];
  monthAudits: NewMembershipMonthAudit[];
  purchases: NewPurchase[];
}

/** Move a "YYYY-MM-01" month key back by whole months. */
export function monthsBack(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 - by, 1));
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${mm}-01`;
}

/**
 * The shared membership stack for one academy (ADR 126-129): what the gym
 * sells, who holds it, and which months are settled.
 *
 * Every row here is ORGANIZATION-scoped, which is why none of them carries an
 * `academy_id`. Staff get nothing: an active owner, manager or instructor
 * trains at their own branch without a membership (ADR 132).
 *
 * The month grid is what the screens read, so this month lands on all four
 * answers — paid, silent (unpaid), reminded, and claimed but not yet confirmed
 * — while last month is settled for everybody, giving the tracker a history.
 */
function buildMemberships(args: {
  academy: SeedAcademy;
  students: StudentDef[];
  ownerUserId: string;
  newId: () => string;
  now: Date;
}): MembershipRows {
  const { academy, students, ownerUserId, newId, now } = args;
  const month = monthOf(now, academy.timeZone);
  // The price history starts one month before anybody holds a plan, so a
  // membership never begins in a month the plan had no price for.
  const openedMonth = monthsBack(month, 4);
  const joinedMonth = monthsBack(month, 3);
  const comingMonth = nextMonth(month);
  // Fixed, because the student's saved membership choice carries a version
  // string built from it: a purchase whose version no longer matches sends the
  // owner down the "terms changed" path instead of a plain confirm.
  const planUpdatedAt = new Date(now.getTime() - 30 * DAY_MS);

  const plan = (
    id: string,
    name: string,
    priceMinor: number,
    extra: Partial<NewAccessPlan> = {},
  ): NewAccessPlan => ({
    id,
    organizationId: academy.id,
    name,
    studentSelectable: true,
    priceMinor,
    currency: academy.currency,
    createdAt: planUpdatedAt,
    updatedAt: planUpdatedAt,
    ...extra,
  });

  const unlimitedId = newId();
  const twiceId = newId();
  const closedId = newId();
  const unlimited = plan(unlimitedId, "Unlimited", 5000, {
    description: "Every class on the timetable.",
  });
  const twice = plan(twiceId, "2× a week", 3500, {
    description: "Any two classes a week.",
  });
  const closed = plan(closedId, "Foundation", 3000, {
    description: "The old beginners' rate.",
    studentSelectable: false,
    archivedAt: new Date(now.getTime() - 20 * DAY_MS),
  });
  const plans = [unlimited, twice, closed];

  const priceRow = (
    planId: string,
    effectiveMonth: string,
    priceMinor: number,
  ): NewAccessPlanPrice => ({
    id: newId(),
    organizationId: academy.id,
    planId,
    effectiveMonth,
    priceMinor,
    currency: academy.currency,
    recordedBy: ownerUserId,
  });
  // Unlimited went up this month, so the price history has something in it and
  // last month still reads at the old rate.
  const planPrices: NewAccessPlanPrice[] = [
    priceRow(unlimitedId, openedMonth, 4500),
    priceRow(unlimitedId, month, 5000),
    priceRow(twiceId, openedMonth, 3500),
    priceRow(closedId, openedMonth, 3000),
  ];

  const planEntities: NewAccessPlanEntity[] = [
    unlimitedId,
    twiceId,
    closedId,
  ].map((planId) => ({
    organizationId: academy.id,
    planId,
    entityId: academy.id,
  }));

  const policies: NewPolicy[] = [
    {
      organizationId: academy.id,
      graceDays: 7,
      calendarTimeZone: academy.timeZone,
      bankDetails: `${academy.name}\nIBAN: DE89 3704 0044 0532 0130 00\nBank: Demo Bank\nRef: the reference shown on your membership`,
    },
  ];

  const assignments: NewAssignment[] = [];
  const changes: NewAssignmentChange[] = [];
  const months: NewMembershipMonth[] = [];
  const monthAudits: NewMembershipMonthAudit[] = [];
  const purchases: NewPurchase[] = [];

  const settle = (
    assignmentId: string,
    on: string,
    row: Partial<NewMembershipMonth>,
  ) => {
    months.push({
      id: newId(),
      organizationId: academy.id,
      assignmentId,
      month: on,
      paid: false,
      ...row,
    });
    if (row.paid) {
      monthAudits.push({
        id: newId(),
        organizationId: academy.id,
        assignmentId,
        month: on,
        wasPaid: null,
        paid: true,
        actorId: ownerUserId,
      });
    }
  };

  // joinedMonth .. last month, newest first.
  const settledMonths = [1, 2, 3].map((back) => monthsBack(month, back));

  const eligible = students.filter(
    (s) => s.status === "active" || s.status === "suspended",
  );
  // One active member holds no membership at all: the state the overview's
  // "needs attention" list and the student's own "choose a membership" screen
  // are both about. They have picked one and said they paid, so the owner has
  // a request waiting.
  const awaiting = eligible[eligible.length - 1];
  const holders = eligible.filter((s) => s !== awaiting);

  holders.forEach((s, i) => {
    const heldPlanId = i % 3 === 0 ? twiceId : unlimitedId;
    const id = newId();
    const createdAt = new Date(now.getTime() - 120 * DAY_MS);
    assignments.push({
      id,
      organizationId: academy.id,
      userId: s.persona.userId,
      planId: heldPlanId,
      assigningEntityId: academy.id,
      startMonth: joinedMonth,
      status: s.status === "suspended" ? "suspended" : "active",
      assignedBy: ownerUserId,
      createdAt,
      updatedAt: createdAt,
    });

    // Every month since they joined is settled, so nobody carries invented
    // debt from before the demo starts.
    settledMonths.forEach((past, back) => {
      settle(id, past, {
        paid: true,
        recordedBy: ownerUserId,
        recordedAt: new Date(now.getTime() - (25 + back * 30) * DAY_MS),
      });
    });

    // Paid is the normal state, so the demo is a gym that mostly pays rather
    // than one where everybody is about to be locked out on the 8th. Three
    // people carry the other three answers, one each.
    switch (i) {
      case 0:
        // Silent: owes, and no row at all. `paid` false and a missing row mean
        // the same thing to every rule.
        break;
      case 1:
        // Told about it. The row exists to carry the reminder stamp, so the
        // sweep never warns the same person twice.
        settle(id, month, {
          remindedAt: new Date(now.getTime() - DAY_MS),
        });
        break;
      case 2:
        settle(id, month, {
          claimedAt: new Date(now.getTime() - DAY_MS),
        });
        break;
      default:
        settle(id, month, {
          paid: true,
          recordedBy: ownerUserId,
          recordedAt: new Date(now.getTime() - 2 * DAY_MS),
        });
        break;
    }
  });

  // A plan change that waits for the 1st (ADR 129): the running membership is
  // stopped at next month and its successor starts there, so exactly one of the
  // two applies on either side of the boundary.
  const source = assignments[1];
  const sourceId = source?.id;
  if (source && sourceId) {
    source.endMonth = comingMonth;
    const successorId = newId();
    assignments.push({
      id: successorId,
      organizationId: academy.id,
      userId: source.userId,
      planId: twiceId,
      assigningEntityId: academy.id,
      startMonth: comingMonth,
      status: "active",
      assignedBy: ownerUserId,
    });
    changes.push({
      id: newId(),
      organizationId: academy.id,
      userId: source.userId,
      sourceAssignmentId: sourceId,
      targetAssignmentId: successorId,
      effectiveMonth: comingMonth,
      previousSourceEndMonth: null,
      scheduledBy: ownerUserId,
    });
  }

  if (awaiting) {
    const id = newId();
    purchases.push({
      id,
      organizationId: academy.id,
      userId: awaiting.persona.userId,
      entityId: academy.id,
      planId: unlimitedId,
      planName: unlimited.name,
      priceMinor: 5000,
      currency: academy.currency,
      startMonth: month,
      entityIds: [academy.id],
      branchNames: [academy.name],
      version: JSON.stringify({
        updatedAt: planUpdatedAt.toISOString(),
        month,
        price: { priceMinor: 5000, currency: academy.currency },
        entityIds: [academy.id],
      }),
      reference: `MEM-${id.replaceAll("-", "").toUpperCase()}`,
      status: "claimed",
      claimedAt: new Date(now.getTime() - DAY_MS),
    });
  }

  return {
    policies,
    plans,
    planPrices,
    planEntities,
    assignments,
    changes,
    months,
    monthAudits,
    purchases,
  };
}

/**
 * Build the whole seed dataset: ONE demo academy ("Alma beta") with the real user
 * as its owner, surrounded by fake staff, members, classes, payments, and ranks.
 */
export function buildSeedGraph(opts: SeedGraphOptions): SeedGraph {
  const now = opts.now ?? new Date();
  const newId = opts.newId;
  const academy = opts.academy ?? SEED_ACADEMY;

  // ---- Fake personas -------------------------------------------------------
  const coach1 = persona("coach1", 101, "Tomás Simão");
  const coach2 = persona("coach2", 102, "Fernando Marques Gonzaga");
  // A third coach who has not taught yet — the O10 roster must still show them,
  // with zeros rather than a missing card.
  const coach3 = persona("coach3", 103, "Marta Lindqvist");
  // The person hired to run the gym (ADR 129). They hold an organization seat
  // and NO entity membership: management reaches every branch on its own, and
  // giving them one would enrol them as a student of this mat.
  const manager = persona("manager1", 104, "Inês Carvalho");

  // Students: mostly active, plus pending / pending-instructor / suspended /
  // removed so the member list shows every status, and four who stopped training
  // at different points so all four drift bands appear on the O1 widget.
  const ACTIVE = { status: "active", role: "student", invitedRole: "student" };
  const studentDefs: Omit<StudentDef, "persona">[] = [
    ...Array.from({ length: 10 }, () => ({ ...ACTIVE })),
    { ...ACTIVE, quietSince: 10 }, // cooling  (8-13 days)
    { ...ACTIVE, quietSince: 18 }, // at risk  (14-27 days)
    { ...ACTIVE, quietSince: 32 }, // dormant  (28+ days)
    { ...ACTIVE, quietSince: null }, // joined, never trained
    { status: "pending", role: "member", invitedRole: "student" },
    { status: "pending", role: "member", invitedRole: "student" },
    { status: "pending", role: "member", invitedRole: "instructor" },
    { status: "suspended", role: "student", invitedRole: "student" },
    { status: "removed", role: "student", invitedRole: "student" },
    { status: "archived", role: "student", invitedRole: "student" },
    { ...ACTIVE },
  ];
  const students: StudentDef[] = studentDefs.map((d, i) => ({
    persona: persona(`s${String(i + 1).padStart(2, "0")}`, i + 1),
    ...d,
  }));

  // ---- Auth rows (user / organization / member / invite) -------------------
  const users: NewUser[] = [
    userRow(coach1),
    userRow(coach2),
    userRow(coach3),
    userRow(manager),
    ...students.map((s) => userRow(s.persona)),
  ];

  const organizations: NewOrganization[] = [
    {
      id: academy.id,
      name: academy.name,
      slug: academy.slug,
      createdAt: now,
    },
  ];

  // One seat per person. The Better Auth `member` row records only that they
  // belong to the gym; the status and the invited role are the entity
  // membership's, which is where every screen reads them (ADR 124).
  const seats = [
    // YOU — the owner.
    {
      id: seedMemberId(academy.key, "you"),
      organizationId: academy.id,
      userId: opts.realUser.id,
      role: "owner",
      status: "active",
      invitedRole: null,
      createdAt: new Date(now.getTime() - 200 * DAY_MS),
      branchMembership: true,
    },
    {
      id: seedMemberId(academy.key, manager.handle),
      organizationId: academy.id,
      userId: manager.userId,
      role: "manager",
      status: "active",
      invitedRole: null,
      createdAt: new Date(now.getTime() - 190 * DAY_MS),
      branchMembership: false,
    },
    ...[coach1, coach2, coach3].map((c, i) => ({
      id: seedMemberId(academy.key, c.handle),
      organizationId: academy.id,
      userId: c.userId,
      role: "instructor",
      status: "active",
      invitedRole: "instructor",
      createdAt: new Date(now.getTime() - (180 - i * 10) * DAY_MS),
      branchMembership: true,
    })),
    ...students.map((s, i) => ({
      id: seedMemberId(academy.key, s.persona.handle),
      organizationId: academy.id,
      userId: s.persona.userId,
      role: s.role,
      status: s.status,
      invitedRole: s.invitedRole,
      createdAt: new Date(now.getTime() - (150 - i * 3) * DAY_MS),
      branchMembership: true,
    })),
  ];

  const members: NewMember[] = seats.map((seat) => ({
    id: seat.id,
    organizationId: seat.organizationId,
    userId: seat.userId,
    role: seat.role,
    createdAt: seat.createdAt,
  }));

  // The default BJJ academy entity carries the organization's own id, so every
  // `academy_id` already on a seed row keeps pointing at the right place and the
  // printed QR posters and check-in links stay valid (ADR 124, Decision 5).
  const entities: NewEntity[] = [
    {
      id: academy.id,
      organizationId: academy.id,
      type: "bjj_academy",
      name: academy.name,
      slug: academy.slug,
      isDefault: true,
      timeZone: academy.timeZone,
      country: academy.country,
      address: academy.address,
      mapUrl: academy.mapUrl,
      publicCode: academy.publicCode,
      // The gym runs on shared memberships, the way every branch made today
      // does (ADR 128). Leaving it null would put the demo on the legacy
      // branch dues gate, which no new academy ever sees.
      membershipEnforcedAt: new Date(now.getTime() - 200 * DAY_MS),
      createdAt: now,
      updatedAt: now,
    },
  ];

  const academyProfiles: NewAcademyProfile[] = [
    { entityId: academy.id, createdAt: now, updatedAt: now },
  ];

  const entityMemberships: NewEntityMembership[] = seats
    .filter((seat) => seat.branchMembership)
    .map((seat) => ({
    id: seedEntityMembershipId(seat.id),
    organizationId: academy.id,
    entityId: academy.id,
    userId: seat.userId,
    role: seat.role,
    status: seat.status,
    invitedRole: seat.invitedRole,
    joinedAt: seat.status === "active" ? seat.createdAt : null,
    createdAt: seat.createdAt,
    updatedAt: seat.createdAt,
  }));

  // One live invite link per role (drives the invite/staff cards). The tester
  // joins the beta through the instructor link.
  const invites: NewInvite[] = [
    {
      academyId: academy.id,
      role: "student",
      token: "seedtoken_alma_student",
      createdBy: opts.realUser.id,
    },
    {
      academyId: academy.id,
      role: "instructor",
      token: "seedtoken_alma_instructor",
      createdBy: opts.realUser.id,
    },
  ];

  // ---- Weekly board (you = owner; the coaches teach) -----------------------
  // The real Alma timetable, Mon-Sat. Days are 1=Mon … 6=Sat.
  const tomas = coach1.userId;
  const fernando = coach2.userId;
  const owner = opts.realUser.id;
  const templateSpecs: TemplateSpec[] = [
    {
      title: "Gi · All levels",
      discipline: "bjj",
      daysOfWeek: [2, 4],
      startsAtMinutes: 8 * 60,
      // The small morning class: run.ts books every active student into the
      // first class under 12 places, so this is the over-capacity red count.
      durationMinutes: 60,
      capacity: 8,
      instructorId: tomas,
    },
    {
      title: "Gi · All levels",
      discipline: "bjj",
      daysOfWeek: [1, 2, 5],
      startsAtMinutes: 9 * 60,
      durationMinutes: 60,
      capacity: 20,
      instructorId: tomas,
    },
    {
      title: "Gi · Beginner",
      discipline: "bjj",
      daysOfWeek: [3, 4],
      startsAtMinutes: 9 * 60,
      durationMinutes: 60,
      capacity: 20,
      instructorId: tomas,
    },
    {
      title: "Gi · Beginner",
      discipline: "bjj",
      daysOfWeek: [6],
      startsAtMinutes: 9 * 60,
      durationMinutes: 60,
      capacity: 20,
      instructorId: fernando,
    },
    {
      title: "Open Mat · Gi + NoGi",
      discipline: "other",
      daysOfWeek: [6],
      startsAtMinutes: 10 * 60,
      durationMinutes: 120,
      capacity: 40,
      instructorId: owner,
    },
    {
      title: "NoGi · Inter-Advanced",
      discipline: "nogi",
      daysOfWeek: [1],
      startsAtMinutes: 12 * 60 + 30,
      durationMinutes: 60,
      capacity: 20,
      instructorId: tomas,
    },
    {
      title: "NoGi · All levels",
      discipline: "nogi",
      daysOfWeek: [3, 5],
      startsAtMinutes: 12 * 60 + 30,
      durationMinutes: 60,
      capacity: 20,
      instructorId: tomas,
    },
    {
      title: "Gi · All levels",
      discipline: "bjj",
      daysOfWeek: [2, 4],
      startsAtMinutes: 12 * 60 + 30,
      durationMinutes: 60,
      capacity: 20,
      instructorId: fernando,
    },
    {
      title: "Gi · All levels",
      discipline: "bjj",
      daysOfWeek: [1],
      startsAtMinutes: 18 * 60 + 30,
      durationMinutes: 60,
      capacity: 24,
      instructorId: tomas,
    },
    {
      title: "Gi · Inter-Advanced",
      discipline: "bjj",
      daysOfWeek: [3, 5],
      startsAtMinutes: 18 * 60 + 30,
      durationMinutes: 60,
      capacity: 24,
      instructorId: tomas,
    },
    {
      title: "NoGi · All levels",
      discipline: "nogi",
      daysOfWeek: [1],
      startsAtMinutes: 19 * 60 + 30,
      durationMinutes: 60,
      capacity: 24,
      instructorId: owner,
    },
    {
      title: "NoGi · Inter-Advanced",
      discipline: "nogi",
      daysOfWeek: [3, 5],
      startsAtMinutes: 19 * 60 + 30,
      durationMinutes: 60,
      capacity: 24,
      instructorId: owner,
    },
    {
      title: "Kids Gi",
      discipline: "bjj",
      daysOfWeek: [1, 3],
      startsAtMinutes: 17 * 60,
      durationMinutes: 45,
      capacity: 16,
      instructorId: fernando,
      // Paused: past classes exist, but no new ones are generated (O3 state).
      status: "paused",
    },
  ];
  const data = buildAcademy({
    academy,
    templates: templateSpecs,
    students,
    staffRanks: [
      { memberHandle: coach1.handle, belt: "Black" },
      { memberHandle: coach2.handle, belt: "Black" },
      { memberHandle: coach3.handle, belt: "Black" },
    ],
    staffInstructorId: opts.realUser.id,
    newId,
    now,
  });

  // Direct attributions with more than one referrer and deliberate unassigned
  // students, plus one corrected and one cleared attribution so the O9 history
  // shows all three audit actions. An assigned removed student gives the
  // historical include toggle a meaningful example.
  const referrals: NewReferral[] = [];
  const referralAudits: NewReferralAudit[] = [];
  const addReferral = (
    academyId: string,
    studentMemberId: string,
    referrerMemberId: string,
    actorId: string,
  ) => {
    referrals.push({
      id: newId(),
      academyId,
      studentMemberId,
      referrerMemberId,
      assignedBy: actorId,
      createdAt: new Date(now.getTime() - 60 * DAY_MS),
      updatedAt: new Date(now.getTime() - 60 * DAY_MS),
    });
    referralAudits.push({
      id: newId(),
      academyId,
      studentMemberId,
      oldReferrerMemberId: null,
      newReferrerMemberId: referrerMemberId,
      action: "assigned",
      actorId,
      occurredAt: new Date(now.getTime() - 60 * DAY_MS),
    });
  };
  const ownerMemberId = seedMembershipId(academy.key, "you");
  const coach1MemberId = seedMembershipId(academy.key, coach1.handle);
  students.slice(0, 8).forEach((student, index) => {
    addReferral(
      academy.id,
      seedMembershipId(academy.key, student.persona.handle),
      index % 2 === 0 ? coach1MemberId : ownerMemberId,
      opts.realUser.id,
    );
  });
  const removedStudent = students.find(
    (student) => student.status === "removed",
  );
  if (removedStudent) {
    addReferral(
      academy.id,
      seedMembershipId(academy.key, removedStudent.persona.handle),
      coach1MemberId,
      opts.realUser.id,
    );
  }

  // Corrected: credited to the coach at first, moved to the owner a month later.
  const correctedStudent = students[8];
  if (correctedStudent) {
    const studentMemberId = seedMembershipId(
      academy.key,
      correctedStudent.persona.handle,
    );
    addReferral(academy.id, studentMemberId, coach1MemberId, opts.realUser.id);
    const row = referrals[referrals.length - 1];
    if (row) {
      row.referrerMemberId = ownerMemberId;
      row.updatedAt = new Date(now.getTime() - 25 * DAY_MS);
    }
    referralAudits.push({
      id: newId(),
      academyId: academy.id,
      studentMemberId,
      oldReferrerMemberId: coach1MemberId,
      newReferrerMemberId: ownerMemberId,
      action: "corrected",
      actorId: opts.realUser.id,
      occurredAt: new Date(now.getTime() - 25 * DAY_MS),
    });
  }

  // Cleared: the row is retained with a null referrer, which locks the student
  // against a fresh guess by another staff member (ADR 52).
  const clearedStudent = students[9];
  if (clearedStudent) {
    const studentMemberId = seedMembershipId(
      academy.key,
      clearedStudent.persona.handle,
    );
    addReferral(academy.id, studentMemberId, coach1MemberId, opts.realUser.id);
    const row = referrals[referrals.length - 1];
    if (row) {
      row.referrerMemberId = null;
      row.updatedAt = new Date(now.getTime() - 15 * DAY_MS);
    }
    referralAudits.push({
      id: newId(),
      academyId: academy.id,
      studentMemberId,
      oldReferrerMemberId: coach1MemberId,
      newReferrerMemberId: null,
      action: "cleared",
      actorId: opts.realUser.id,
      occurredAt: new Date(now.getTime() - 15 * DAY_MS),
    });
  }

  return {
    users,
    organizations,
    members,
    entities,
    academyProfiles,
    entityMemberships,
    invites,
    templates: data.templates,
    pastClasses: data.pastClasses,
    participations: data.participations,
    plans: data.plans,
    claims: data.claims,
    memberships: data.memberships,
    ranks: data.ranks,
    promotions: data.promotions,
    notes: data.notes,
    dropIns: data.dropIns,
    dropInVisits: data.dropInVisits,
    referrals,
    referralAudits,
    quietStudentIds: students
      .filter((s) => s.quietSince !== undefined)
      .map((s) => s.persona.userId),
  };
}
