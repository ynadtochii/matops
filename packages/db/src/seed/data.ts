/**
 * Pure seed-data builders. NO I/O, NO clock reading, NO db — every row is a plain
 * value object, so the whole dataset is unit-testable and deterministic given a
 * fixed `now` + id generator (see seed/data.test.ts). The IO layer (run.ts) takes
 * these arrays and writes them.
 *
 * The dataset is shaped to light up EVERY UI state at least once: member statuses
 * (active / pending / suspended / removed), payment dots (paid / due_soon /
 * overdue) + a pending claim, attendance history (present / absent / walk-in),
 * belts across disciplines with a promotion timeline, drop-in leads, and a live
 * invite link per role.
 */
import { computeOccurrences, paymentPeriod } from "@matops/domain";

import type {
  academyInvite,
  classInstance,
  classParticipation,
  classTemplate,
  dropIn,
  member,
  memberDues,
  memberNote,
  memberRank,
  membershipPlan,
  organization,
  paymentClaim,
  paymentSettings,
  rankPromotion,
  user,
} from "../schema";
import type { SeedAcademy } from "./registry";
import { SEED_ACADEMIES, seedMemberId, seedUserId } from "./registry";

type NewUser = typeof user.$inferInsert;
type NewOrganization = typeof organization.$inferInsert;
type NewMember = typeof member.$inferInsert;
type NewInvite = typeof academyInvite.$inferInsert;
type NewTemplate = typeof classTemplate.$inferInsert;
type NewClass = typeof classInstance.$inferInsert;
type NewParticipation = typeof classParticipation.$inferInsert;
type NewPlan = typeof membershipPlan.$inferInsert;
type NewDues = typeof memberDues.$inferInsert;
type NewClaim = typeof paymentClaim.$inferInsert;
type NewSettings = typeof paymentSettings.$inferInsert;
type NewRank = typeof memberRank.$inferInsert;
type NewPromotion = typeof rankPromotion.$inferInsert;
type NewNote = typeof memberNote.$inferInsert;
type NewDropIn = typeof dropIn.$inferInsert;

/** Everything the seed inserts, grouped by table. Future (materialized) classes
 * and their bookings are NOT here — run.ts adds those after materialization,
 * because their class ids are database-generated. */
export interface SeedGraph {
  users: NewUser[];
  organizations: NewOrganization[];
  members: NewMember[];
  invites: NewInvite[];
  templates: NewTemplate[];
  pastClasses: NewClass[];
  participations: NewParticipation[];
  plans: NewPlan[];
  dues: NewDues[];
  claims: NewClaim[];
  settings: NewSettings[];
  ranks: NewRank[];
  promotions: NewPromotion[];
  notes: NewNote[];
  dropIns: NewDropIn[];
}

export interface SeedGraphOptions {
  /** The real, already-registered user you sign in as (owner of ALPHA, student of BETA). */
  realUser: { id: string; name: string };
  /** Injected id generator for uuid PKs — pass a counter in tests for determinism. */
  newId: () => string;
  /** "Now" — injected so the dataset is deterministic (default: real now). */
  now?: Date;
  academies?: { alpha: SeedAcademy; beta: SeedAcademy };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far back past classes go (attendance history for streaks + insights). */
const PAST_WINDOW_DAYS = 28;

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

function persona(handle: string, seed: number): Persona {
  return {
    handle,
    userId: seedUserId(handle),
    name: personName(seed),
    email: `${seedUserId(handle)}@demo.matops.test`,
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
}

/**
 * Build one academy's slice of the graph. `staffInstructorId` teaches the classes
 * and stamps ranks/notes. `students` are the members whose attendance/dues/rank
 * data populates the screens. `you` is the real user's membership (owner of
 * ALPHA, student of BETA) — passed so their own bookings/dues/rank get seeded.
 */
function buildAcademy(args: {
  academy: SeedAcademy;
  templates: TemplateSpec[];
  students: {
    persona: Persona;
    status: string;
    role: string;
    invitedRole: string | null;
  }[];
  staffInstructorId: string;
  newId: () => string;
  now: Date;
}): {
  templates: NewTemplate[];
  pastClasses: NewClass[];
  participations: NewParticipation[];
  plans: NewPlan[];
  dues: NewDues[];
  claims: NewClaim[];
  settings: NewSettings;
  ranks: NewRank[];
  promotions: NewPromotion[];
  notes: NewNote[];
  dropIns: NewDropIn[];
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
      status: "active",
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
      const attendees = activeStudents.filter(
        (_, si) => (si + ti + oi) % 3 !== 0,
      );
      let bookingCount = 0;
      attendees.forEach((s, ai) => {
        // ~1 in 5 booked-but-absent; the rest present → realistic attendance %.
        const present = (ai + oi) % 5 !== 0;
        bookingCount += 1;
        participations.push({
          id: newId(),
          academyId: academy.id,
          classId,
          studentId: s.persona.userId,
          bookingStatus: "booked",
          bookingTier: "confirmed",
          bookedAt: new Date(startsAt.getTime() - DAY_MS),
          attendanceStatus: present ? "present" : "absent",
          attendedAt: present ? startsAt : null,
          markedBy: present ? staffInstructorId : null,
        });
      });
      // One walk-in on the most recent class of the first template (booking
      // `none` + present) so the O5 walk-in path has data.
      const walkIn = activeStudents[activeStudents.length - 1];
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

  // --- Payments: plans, per-member dues across all three dots, one open claim. -
  const planId = newId();
  const planLiteId = newId();
  const plan: NewPlan = {
    id: planId,
    academyId: academy.id,
    name: "Monthly Unlimited",
    priceMinor: 5000,
    currency: academy.currency,
    cycle: "monthly",
  };
  const planLite: NewPlan = {
    id: planLiteId,
    academyId: academy.id,
    name: "Monthly · 2× / week",
    priceMinor: 3500,
    currency: academy.currency,
    cycle: "monthly",
  };
  const plans = [plan, planLite];

  // Spread due dates so the roster shows paid / due-soon / overdue side by side.
  // First offset is due-soon so YOU (index 0 of BETA's list) can test "I paid".
  const dueOffsets = [2, 22, -6, 40, -20]; // days from now
  const dues: NewDues[] = students
    .filter((s) => s.status === "active" || s.status === "suspended")
    .map((s, i) => ({
      id: newId(),
      academyId: academy.id,
      memberId: seedMemberId(academy.key, s.persona.handle),
      planId: i % 3 === 0 ? planLiteId : planId,
      nextDueAt: new Date(
        now.getTime() + (dueOffsets[i % dueOffsets.length] ?? 0) * DAY_MS,
      ),
      duesReminderPeriod: null,
    }));

  // One FAKE student has an OPEN "I paid" claim awaiting the owner's confirm.
  // Never YOU — so your own "I paid" button stays available to test.
  const claims: NewClaim[] = [];
  const claimant = students.find(
    (s) => s.status === "active" && s.persona.handle !== "you",
  );
  if (claimant) {
    const period = paymentPeriod(now);
    claims.push({
      id: newId(),
      academyId: academy.id,
      memberId: seedMemberId(academy.key, claimant.persona.handle),
      planId,
      amountMinor: plan.priceMinor,
      currency: academy.currency,
      period,
      status: "pending",
    });
  }

  const settings: NewSettings = {
    academyId: academy.id,
    bankDetails: `${academy.name}\nIBAN: DE89 3704 0044 0532 0130 00\nBank: Demo Bank\nRef: use the code shown on your dues card`,
  };

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
      memberId: seedMemberId(academy.key, s.persona.handle),
      discipline: "bjj",
      belt,
      stripes,
      updatedBy: staffInstructorId,
    });
    // First grant (White) for everyone; a real promotion for the higher belts.
    promotions.push({
      id: newId(),
      academyId: academy.id,
      memberId: seedMemberId(academy.key, s.persona.handle),
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
        memberId: seedMemberId(academy.key, s.persona.handle),
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
  // A judo rank on one member proves the second (no-stripe) system renders.
  if (activeStudents[0]) {
    ranks.push({
      id: newId(),
      academyId: academy.id,
      memberId: seedMemberId(academy.key, activeStudents[0].persona.handle),
      discipline: "judo",
      belt: "Green",
      stripes: 0,
      updatedBy: staffInstructorId,
    });
  }

  const notes: NewNote[] = [];
  activeStudents.slice(0, 2).forEach((s, i) => {
    notes.push({
      id: newId(),
      academyId: academy.id,
      memberId: seedMemberId(academy.key, s.persona.handle),
      body:
        i === 0
          ? "Recovering from a knee tweak — go easy on leg locks for two weeks."
          : "Prepping for first competition next month; keen on extra rounds.",
      authorId: staffInstructorId,
    });
  });

  // --- Drop-in leads (public QR form) for the owner's O4 leads list. ----------
  const dropIns: NewDropIn[] = [
    {
      id: newId(),
      academyId: academy.id,
      firstName: "Pat",
      lastName: "Visitor",
      phone: "+380509998877",
      email: "pat.visitor@demo.matops.test",
      classId: null,
      consent: true,
      visitCount: 1,
    },
    {
      id: newId(),
      academyId: academy.id,
      firstName: "Robin",
      lastName: "Trial",
      phone: "+380509998866",
      email: null,
      classId: null,
      consent: true,
      visitCount: 2,
    },
  ];

  return {
    templates,
    pastClasses,
    participations,
    plans,
    dues,
    claims,
    settings,
    ranks,
    promotions,
    notes,
    dropIns,
  };
}

/**
 * Build the whole seed dataset: two demo academies with the real user as owner of
 * ALPHA and an active student of BETA, surrounded by fake members, classes,
 * payments, and ranks.
 */
export function buildSeedGraph(opts: SeedGraphOptions): SeedGraph {
  const now = opts.now ?? new Date();
  const newId = opts.newId;
  const academies = opts.academies ?? {
    alpha: SEED_ACADEMIES.alpha,
    beta: SEED_ACADEMIES.beta,
  };
  const { alpha, beta } = academies;

  // ---- Fake personas -------------------------------------------------------
  const alphaCoach = persona("a_coach1", 101);
  const betaOwner = persona("b_owner1", 201);

  // ALPHA students: mostly active, plus pending / pending-instructor / suspended
  // / removed so the roster shows every status.
  const alphaStudentDefs: {
    status: string;
    role: string;
    invitedRole: string | null;
  }[] = [];
  for (let i = 0; i < 20; i++) {
    if (i < 14)
      alphaStudentDefs.push({
        status: "active",
        role: "student",
        invitedRole: "student",
      });
    else if (i < 16)
      alphaStudentDefs.push({
        status: "pending",
        role: "member",
        invitedRole: "student",
      });
    else if (i === 16)
      alphaStudentDefs.push({
        status: "pending",
        role: "member",
        invitedRole: "instructor",
      });
    else if (i === 17)
      alphaStudentDefs.push({
        status: "suspended",
        role: "student",
        invitedRole: "student",
      });
    else if (i === 18)
      alphaStudentDefs.push({
        status: "removed",
        role: "student",
        invitedRole: "student",
      });
    else
      alphaStudentDefs.push({
        status: "active",
        role: "student",
        invitedRole: "student",
      });
  }
  const alphaStudents = alphaStudentDefs.map((d, i) => ({
    persona: persona(`a_s${String(i + 1).padStart(2, "0")}`, i + 1),
    ...d,
  }));

  const betaStudents = Array.from({ length: 5 }, (_, i) => ({
    persona: persona(`b_s${String(i + 1).padStart(2, "0")}`, i + 50),
    status: "active",
    role: "student",
    invitedRole: "student",
  }));

  // ---- Auth rows (user / organization / member / invite) -------------------
  const users: NewUser[] = [
    userRow(alphaCoach),
    userRow(betaOwner),
    ...alphaStudents.map((s) => userRow(s.persona)),
    ...betaStudents.map((s) => userRow(s.persona)),
  ];

  const organizations: NewOrganization[] = [alpha, beta].map((a) => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    publicCode: a.publicCode,
    createdAt: now,
  }));

  const members: NewMember[] = [
    // YOU — owner of ALPHA, active.
    {
      id: seedMemberId(alpha.key, "you"),
      organizationId: alpha.id,
      userId: opts.realUser.id,
      role: "owner",
      status: "active",
      invitedRole: null,
      createdAt: new Date(now.getTime() - 200 * DAY_MS),
    },
    // ALPHA instructor.
    {
      id: seedMemberId(alpha.key, alphaCoach.handle),
      organizationId: alpha.id,
      userId: alphaCoach.userId,
      role: "instructor",
      status: "active",
      invitedRole: "instructor",
      createdAt: new Date(now.getTime() - 180 * DAY_MS),
    },
    // ALPHA students (varied statuses).
    ...alphaStudents.map((s, i) => ({
      id: seedMemberId(alpha.key, s.persona.handle),
      organizationId: alpha.id,
      userId: s.persona.userId,
      role: s.role,
      status: s.status,
      invitedRole: s.invitedRole,
      createdAt: new Date(now.getTime() - (150 - i * 3) * DAY_MS),
    })),
    // BETA owner (fake) — so BETA is never ownerless.
    {
      id: seedMemberId(beta.key, betaOwner.handle),
      organizationId: beta.id,
      userId: betaOwner.userId,
      role: "owner",
      status: "active",
      invitedRole: null,
      createdAt: new Date(now.getTime() - 120 * DAY_MS),
    },
    // YOU — active student of BETA.
    {
      id: seedMemberId(beta.key, "you"),
      organizationId: beta.id,
      userId: opts.realUser.id,
      role: "student",
      status: "active",
      invitedRole: "student",
      createdAt: new Date(now.getTime() - 90 * DAY_MS),
    },
    // BETA students.
    ...betaStudents.map((s, i) => ({
      id: seedMemberId(beta.key, s.persona.handle),
      organizationId: beta.id,
      userId: s.persona.userId,
      role: s.role,
      status: s.status,
      invitedRole: s.invitedRole,
      createdAt: new Date(now.getTime() - (80 - i * 5) * DAY_MS),
    })),
  ];

  // One live invite link per role on ALPHA (drives the invite/staff cards).
  const invites: NewInvite[] = [
    {
      academyId: alpha.id,
      role: "student",
      token: "seedtoken_alpha_student",
      createdBy: opts.realUser.id,
    },
    {
      academyId: alpha.id,
      role: "instructor",
      token: "seedtoken_alpha_instructor",
      createdBy: opts.realUser.id,
    },
  ];

  // ---- ALPHA domain data (you = owner; coach teaches) ----------------------
  const alphaTemplates: TemplateSpec[] = [
    {
      title: "BJJ Fundamentals",
      discipline: "bjj",
      daysOfWeek: [1, 3],
      startsAtMinutes: 18 * 60,
      durationMinutes: 60,
      capacity: 20,
      instructorId: alphaCoach.userId,
    },
    {
      title: "No-Gi",
      discipline: "nogi",
      daysOfWeek: [2, 4],
      startsAtMinutes: 19 * 60,
      durationMinutes: 60,
      capacity: 16,
      instructorId: alphaCoach.userId,
    },
    {
      title: "Judo",
      discipline: "judo",
      daysOfWeek: [5],
      startsAtMinutes: 18 * 60 + 30,
      durationMinutes: 90,
      capacity: 12,
      instructorId: alphaCoach.userId,
    },
    {
      title: "Open Mat",
      discipline: "other",
      daysOfWeek: [6],
      startsAtMinutes: 10 * 60,
      durationMinutes: 120,
      capacity: 30,
      instructorId: opts.realUser.id,
    },
    {
      title: "MMA Sparring",
      discipline: "mma",
      daysOfWeek: [3],
      startsAtMinutes: 20 * 60,
      durationMinutes: 60,
      capacity: 14,
      instructorId: alphaCoach.userId,
    },
  ];
  const alphaData = buildAcademy({
    academy: alpha,
    templates: alphaTemplates,
    students: alphaStudents,
    staffInstructorId: opts.realUser.id,
    newId,
    now,
  });

  // ---- BETA domain data (you = student; fake owner teaches) -----------------
  // Include YOU in BETA's student roster so your own attendance / dues / rank
  // get seeded (mobile Training + Profile screens).
  const betaMembersForData = [
    {
      persona: {
        handle: "you",
        userId: opts.realUser.id,
        name: opts.realUser.name,
        email: "",
        phone: "",
      },
      status: "active",
      role: "student",
      invitedRole: "student",
    },
    ...betaStudents,
  ];
  const betaTemplates: TemplateSpec[] = [
    {
      title: "BJJ",
      discipline: "bjj",
      daysOfWeek: [1],
      startsAtMinutes: 18 * 60,
      durationMinutes: 60,
      capacity: 12,
      instructorId: betaOwner.userId,
    },
    {
      title: "No-Gi",
      discipline: "nogi",
      daysOfWeek: [4],
      startsAtMinutes: 19 * 60,
      durationMinutes: 60,
      capacity: 10,
      instructorId: betaOwner.userId,
    },
  ];
  const betaData = buildAcademy({
    academy: beta,
    templates: betaTemplates,
    students: betaMembersForData,
    staffInstructorId: betaOwner.userId,
    newId,
    now,
  });

  return {
    users,
    organizations,
    members,
    invites,
    templates: [...alphaData.templates, ...betaData.templates],
    pastClasses: [...alphaData.pastClasses, ...betaData.pastClasses],
    participations: [...alphaData.participations, ...betaData.participations],
    plans: [...alphaData.plans, ...betaData.plans],
    dues: [...alphaData.dues, ...betaData.dues],
    claims: [...alphaData.claims, ...betaData.claims],
    settings: [alphaData.settings, betaData.settings],
    ranks: [...alphaData.ranks, ...betaData.ranks],
    promotions: [...alphaData.promotions, ...betaData.promotions],
    notes: [...alphaData.notes, ...betaData.notes],
    dropIns: [...alphaData.dropIns, ...betaData.dropIns],
  };
}
