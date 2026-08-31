import { randomBytes } from "node:crypto";

import type { PublicApiAcademy } from "@matops/db";
import type { DbExec } from "@matops/db/client";
import type { PublicErrorCode } from "@matops/domain";
import {
  bookVisitor,
  cancelVisitorBooking,
  getPublicClass,
  listPublicClasses,
  resolvePublicApiKey,
} from "@matops/db";
import {
  FALLBACK_TIME_ZONE,
  isPubliclyBookable,
  normalizePhone,
  originAllowed,
  PUBLIC_CLASS_LIMIT,
  PUBLIC_ERROR_STATUS,
  publicClassView,
  publicClassWindow,
  publicInstant,
  resolveAcademyTimeZone,
} from "@matops/domain";
import { PublicBookingSchema } from "@matops/validators";

import { clientIp, take } from "../rate-limit";

/**
 * The public booking API (ADR 115). Plain REST and JSON, not tRPC, because the
 * callers are third parties building an academy's web presence.
 *
 * Two things hold this surface together. The KEY names the academy, so no path
 * carries an academy id and a caller cannot reach another gym by editing a URL.
 * And every read selects the published columns in `@matops/db`, so no response
 * body can carry capacity, counts, a coach, a member or a visitor name.
 *
 * These handlers run OUTSIDE the tenant seam on the base connection, because an
 * unauthenticated caller has no session and no academy scope. That is the second
 * enumerated exception to the seam, with the drop-in submit as its precedent
 * (docs/issues/12, 25). Nothing here can create a user, create a member, change
 * a member, read anything about a member, or move money: it has no code path to.
 *
 * One known ceiling: the limits below run on the per-process in-memory brake in
 * `../rate-limit.ts`, so each instance keeps its own counters and a cold start
 * forgets them. That is deliberate (ADR 116): these are PRODUCT rules ("3
 * bookings per phone per day"), and the cost ceiling is a WAF rule at the edge,
 * which blocks a flood before it reaches a function we have paid to start. Each
 * handler opts into its limits by hand, so a fifth one added later must not
 * forget.
 */

const KEY_HEADER = "x-matops-key";

export const READS_PER_KEY = { max: 60, windowMs: 60_000 };
export const READS_PER_ADDRESS = { max: 60, windowMs: 60_000 };
export const BOOKINGS_PER_ADDRESS = { max: 5, windowMs: 10 * 60_000 };
export const BOOKINGS_PER_PHONE = { max: 3, windowMs: 24 * 60 * 60_000 };
export const BOOKINGS_PER_ACADEMY = { max: 30, windowMs: 24 * 60 * 60_000 };
export const CANCELS_PER_ADDRESS = { max: 10, windowMs: 60 * 60_000 };

interface Bucket {
  max: number;
  windowMs: number;
}

function corsHeaders(
  origin: string | null,
  academy?: PublicApiAcademy,
): Record<string, string> {
  const allowed = academy ? originAllowed(origin, academy.origins) : true;
  return {
    "Access-Control-Allow-Origin": allowed && origin ? origin : "*",
    "Access-Control-Allow-Headers": `content-type, ${KEY_HEADER}`,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function publicError(
  code: PublicErrorCode,
  message: string,
  init: {
    origin?: string | null;
    retryAfterSeconds?: number;
    field?: string;
  } = {},
): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...corsHeaders(init.origin ?? null),
  };
  if (init.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(init.retryAfterSeconds);
  }
  return new Response(
    JSON.stringify({
      error: { code, message, ...(init.field ? { field: init.field } : {}) },
    }),
    { status: PUBLIC_ERROR_STATUS[code], headers },
  );
}

function ok(
  body: unknown,
  origin: string | null,
  academy: PublicApiAcademy,
  status = 200,
): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      ...(status === 204 ? {} : { "content-type": "application/json" }),
      ...corsHeaders(origin, academy),
      "cache-control": "no-store",
    },
  });
}

interface Caller {
  academy: PublicApiAcademy;
  origin: string | null;
  ip: string;
  timeZone: string;
}

/**
 * Resolve the key, the origin and the caller's address, or hand back the refusal
 * to return. An unknown key and a switched-off academy answer differently on
 * purpose: one is the integrator's mistake, the other is the gym's own choice.
 */
async function authenticate(
  req: Request,
  db: DbExec,
): Promise<{ caller: Caller } | { refusal: Response }> {
  const origin = req.headers.get("origin");
  const key = req.headers.get(KEY_HEADER)?.trim();
  if (!key) {
    return {
      refusal: publicError(
        "invalid_key",
        "Send your API key in the X-Matops-Key header.",
        { origin },
      ),
    };
  }
  const academy = await resolvePublicApiKey(key, db);
  if (!academy) {
    return {
      refusal: publicError("invalid_key", "That API key is not valid.", {
        origin,
      }),
    };
  }
  if (!academy.enabled) {
    return {
      refusal: publicError(
        "public_api_disabled",
        "This gym has switched public booking off.",
        { origin },
      ),
    };
  }
  if (!originAllowed(origin, academy.origins)) {
    return {
      refusal: publicError(
        "origin_not_allowed",
        "This website is not on the gym's allowed list.",
        { origin },
      ),
    };
  }
  return {
    caller: {
      academy,
      origin,
      ip: clientIp(req.headers),
      timeZone: academy.timeZone
        ? resolveAcademyTimeZone(academy.timeZone)
        : FALLBACK_TIME_ZONE,
    },
  };
}

function limit(
  caller: Caller,
  name: string,
  key: string,
  bucket: Bucket,
): Response | null {
  if (take(`public:${name}:${key}`, bucket.max, bucket.windowMs)) return null;
  return publicError("rate_limited", "Too many requests. Try again shortly.", {
    origin: caller.origin,
    retryAfterSeconds: Math.ceil(bucket.windowMs / 1000),
  });
}

function readLimits(caller: Caller): Response | null {
  return (
    limit(caller, "read-key", caller.academy.academyId, READS_PER_KEY) ??
    limit(caller, "read-ip", caller.ip, READS_PER_ADDRESS)
  );
}

/** CORS preflight. Answers before the key is checked, as a browser sends none. */
export function handleOptions(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

/** GET /academy — the header a booking page prints. */
export async function handleAcademy(
  req: Request,
  db: DbExec,
): Promise<Response> {
  const auth = await authenticate(req, db);
  if ("refusal" in auth) return auth.refusal;
  const { caller } = auth;
  const refused = readLimits(caller);
  if (refused) return refused;
  return ok(
    {
      name: caller.academy.name,
      timeZone: caller.timeZone,
      country: caller.academy.country,
      address: caller.academy.address,
      mapUrl: caller.academy.mapUrl,
    },
    caller.origin,
    caller.academy,
  );
}

/** GET /classes?from=&to= — published, scheduled, future classes only. */
export async function handleClasses(
  req: Request,
  db: DbExec,
  now = new Date(),
): Promise<Response> {
  const auth = await authenticate(req, db);
  if ("refusal" in auth) return auth.refusal;
  const { caller } = auth;
  const refused = readLimits(caller);
  if (refused) return refused;

  const url = new URL(req.url);
  const window = publicClassWindow(
    { from: url.searchParams.get("from"), to: url.searchParams.get("to") },
    now,
  );
  if (!window.ok) {
    return publicError("validation_error", window.message, {
      origin: caller.origin,
      field: window.field,
    });
  }
  const from = window.from.getTime() > now.getTime() ? window.from : now;
  const rows = await listPublicClasses(
    caller.academy.academyId,
    from,
    window.to,
    PUBLIC_CLASS_LIMIT,
    db,
  );
  return ok(
    {
      timeZone: caller.timeZone,
      classes: rows.map((c) => publicClassView(c, caller.timeZone, now)),
    },
    caller.origin,
    caller.academy,
  );
}

/** POST /bookings — one lead, one visit, never a user and never a member. */
export async function handleBooking(
  req: Request,
  db: DbExec,
  now = new Date(),
): Promise<Response> {
  const auth = await authenticate(req, db);
  if ("refusal" in auth) return auth.refusal;
  const { caller } = auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return publicError("validation_error", "Send a JSON body.", {
      origin: caller.origin,
    });
  }
  const parsed = PublicBookingSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".");
    return publicError(
      "validation_error",
      issue?.message ?? "That is not valid.",
      { origin: caller.origin, field: field === "" ? undefined : field },
    );
  }
  const input = parsed.data;
  const phoneKey = normalizePhone(input.phone);

  const refused =
    limit(caller, "book-ip", caller.ip, BOOKINGS_PER_ADDRESS) ??
    limit(caller, "book-phone", phoneKey, BOOKINGS_PER_PHONE) ??
    limit(
      caller,
      "book-academy",
      caller.academy.academyId,
      BOOKINGS_PER_ACADEMY,
    );
  if (refused) return refused;

  const found = await getPublicClass(
    caller.academy.academyId,
    input.classId,
    db,
  );
  if (!found.found) {
    return publicError(
      "class_not_found",
      "That class is not open for booking.",
      { origin: caller.origin },
    );
  }
  if (found.cancelled) {
    return publicError("class_cancelled", "That class has been cancelled.", {
      origin: caller.origin,
    });
  }
  if (!isPubliclyBookable(found.cls.startsAt, now)) {
    return publicError(
      "class_closed",
      "That class starts too soon to book online. Come to the desk instead.",
      { origin: caller.origin },
    );
  }

  const booked = await bookVisitor(
    {
      academyId: caller.academy.academyId,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: phoneKey,
      email: input.email,
      consent: input.consent,
      source: input.source,
      classId: input.classId,
      cancelToken: randomBytes(24).toString("base64url"),
    },
    db,
  );

  return ok(
    {
      bookingId: booked.visitId,
      cancelToken: booked.cancelToken,
      class: {
        id: found.cls.id,
        title: found.cls.title,
        startsAt: publicInstant(found.cls.startsAt, caller.timeZone),
        durationMinutes: found.cls.durationMinutes,
      },
    },
    caller.origin,
    caller.academy,
  );
}

/** DELETE /bookings/{cancelToken} — the booking goes, the LEAD stays. */
export async function handleCancel(
  req: Request,
  cancelToken: string,
  db: DbExec,
): Promise<Response> {
  const auth = await authenticate(req, db);
  if ("refusal" in auth) return auth.refusal;
  const { caller } = auth;
  const refused = limit(caller, "cancel-ip", caller.ip, CANCELS_PER_ADDRESS);
  if (refused) return refused;

  // An unknown token answers 204 like a real one: telling a caller which tokens
  // exist turns this endpoint into a way to test guesses.
  await cancelVisitorBooking(caller.academy.academyId, cancelToken, db);
  return ok(null, caller.origin, caller.academy, 204);
}
