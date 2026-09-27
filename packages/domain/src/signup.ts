import { isValidRank, RANK_SYSTEMS } from "./rank";

export const SIGNUP_DISCIPLINE = "bjj";

export const SIGNUP_NEVER_TRAINED = "never-trained";
export const SIGNUP_FOR_CHILD = "for-child";

export interface SignupAnswers {
  belt?: string;
  stripes?: number;
  health?: string;
  emailUpdates?: boolean;
  waiverId?: string;
}

export interface SignupWrites {
  rank: { discipline: string; belt: string; stripes: number } | null;
  notes: string[];
  emailUpdates: boolean;
  waiverId: string | null;
}

export type SignupResult =
  { ok: true; writes: SignupWrites } | { ok: false; message: string };

export function signupWrites(input: {
  role: string;
  healthQuestion: boolean;
  requiredWaiverId: string | null;
  answers: SignupAnswers;
}): SignupResult {
  if (input.role !== "student") {
    return {
      ok: true,
      writes: {
        rank: null,
        notes: [],
        emailUpdates: false,
        waiverId: null,
      },
    };
  }
  const { belt, stripes = 0, health, emailUpdates, waiverId } = input.answers;

  const choice = belt === SIGNUP_NEVER_TRAINED || belt === SIGNUP_FOR_CHILD;
  if (
    belt !== undefined &&
    !choice &&
    !isValidRank(SIGNUP_DISCIPLINE, belt, stripes)
  ) {
    return {
      ok: false,
      message: "Pick a belt and stripe count from the list.",
    };
  }

  if (input.requiredWaiverId && waiverId !== input.requiredWaiverId) {
    return {
      ok: false,
      message: waiverId
        ? "The agreement changed. Please read it again."
        : "Read and accept the agreement to join.",
    };
  }

  // A form opened before the owner turned the question off must not store health data.
  const answer = health?.trim();
  const notes: string[] = [];
  if (belt === SIGNUP_NEVER_TRAINED) notes.push("Never trained before");
  if (belt === SIGNUP_FOR_CHILD) notes.push("Enquiring for a child");
  if (input.healthQuestion && answer) notes.push(answer);

  const rank =
    belt === undefined || belt === SIGNUP_FOR_CHILD
      ? null
      : belt === SIGNUP_NEVER_TRAINED
        ? {
            discipline: SIGNUP_DISCIPLINE,
            belt: RANK_SYSTEMS[SIGNUP_DISCIPLINE]?.belts[0] ?? "White",
            stripes: 0,
          }
        : { discipline: SIGNUP_DISCIPLINE, belt, stripes };
  return {
    ok: true,
    writes: {
      rank,
      notes,
      emailUpdates: emailUpdates === true,
      waiverId: input.requiredWaiverId,
    },
  };
}

export function waiverTemplate(academyName: string): string {
  return `By signing up you confirm that you understand Brazilian Jiu-Jitsu is a full-contact martial art involving physical contact, grappling and sparring, and that taking part carries a risk of injury. You agree to train within your limits, tap out when needed, and tell your coach about any injuries or medical conditions before class. ${academyName} and its coaches accept no liability for injuries during training, except in cases of negligence.`;
}
