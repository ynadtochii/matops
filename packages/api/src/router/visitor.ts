import { randomBytes } from "node:crypto";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import {
  bookVisitor,
  cancelVisitorBooking,
  createNotice,
  deliverNoticeBatch,
  findPublicAcademyByCode,
  getPublicClass,
  getVisitorBookingStatus,
  listPublicClasses,
} from "@matops/db";
import {
  DAY_MS,
  FALLBACK_TIME_ZONE,
  formatWhen,
  isPubliclyBookable,
  normalizePhone,
  PUBLIC_CLASS_LIMIT,
  publicClassView,
  publicInstant,
  resolveAcademyTimeZone,
} from "@matops/domain";
import { sendEmail } from "@matops/notifications";
import { PublicBookingSchema } from "@matops/validators";

import { clientIp, take } from "../rate-limit";
import { publicProcedure, rateLimited } from "../trpc";

const CodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
const TokenSchema = CodeSchema.extend({ token: z.string().min(24).max(128) });
const BOOKINGS_PER_PHONE = { max: 3, windowMs: 24 * 60 * 60_000 };
const BOOKINGS_PER_ACADEMY = { max: 30, windowMs: 24 * 60 * 60_000 };

function limited(key: string, max: number, windowMs: number): void {
  if (take(key, max, windowMs)) return;
  throw new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message: "Too many requests. Try again shortly.",
  });
}

async function academyFor(
  code: string,
  exec: Parameters<typeof findPublicAcademyByCode>[1],
) {
  const academy = await findPublicAcademyByCode(code, exec);
  if (!academy) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Booking is closed" });
  }
  return academy;
}

export const visitorRouter = {
  schedule: publicProcedure
    .use(rateLimited(60, 60_000))
    .input(CodeSchema)
    .query(async ({ ctx, input }) => {
      const academy = await academyFor(input.code, ctx.baseDb);
      const now = new Date();
      const timeZone = academy.timeZone
        ? resolveAcademyTimeZone(academy.timeZone)
        : FALLBACK_TIME_ZONE;
      const classes = await listPublicClasses(
        academy.academyId,
        now,
        new Date(now.getTime() + academy.bookingWindowDays * DAY_MS),
        PUBLIC_CLASS_LIMIT,
        ctx.baseDb,
      );
      return {
        academy: {
          name: academy.name,
          timeZone,
          country: academy.country,
          address: academy.address,
          mapUrl: academy.mapUrl,
        },
        classes: classes.map((row) => publicClassView(row, timeZone, now)),
      };
    }),

  status: publicProcedure
    .use(rateLimited(60, 60_000))
    .input(TokenSchema)
    .query(async ({ ctx, input }) => {
      const academy = await academyFor(input.code, ctx.baseDb);
      const booking = await getVisitorBookingStatus(
        academy.academyId,
        input.token,
        ctx.baseDb,
      );
      if (!booking) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This booking link has expired or is not valid.",
        });
      }
      const timeZone = academy.timeZone
        ? resolveAcademyTimeZone(academy.timeZone)
        : FALLBACK_TIME_ZONE;
      return {
        bookingStatus: booking.bookingStatus,
        tokenExpiresAt: booking.tokenExpiresAt,
        class: {
          ...booking.class,
          startsAt: publicInstant(booking.class.startsAt, timeZone),
        },
      };
    }),

  book: publicProcedure
    .use(rateLimited(5, 10 * 60_000))
    .input(CodeSchema.extend({ booking: PublicBookingSchema }))
    .mutation(async ({ ctx, input }) => {
      const academy = await academyFor(input.code, ctx.baseDb);
      const phone = normalizePhone(input.booking.phone);
      limited(
        `visitor:phone:${phone}`,
        BOOKINGS_PER_PHONE.max,
        BOOKINGS_PER_PHONE.windowMs,
      );
      limited(
        `visitor:academy:${academy.academyId}`,
        BOOKINGS_PER_ACADEMY.max,
        BOOKINGS_PER_ACADEMY.windowMs,
      );
      const found = await getPublicClass(
        academy.academyId,
        input.booking.classId,
        ctx.baseDb,
      );
      if (!found.found) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That class is not open for booking.",
        });
      }
      if (found.cancelled) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "That class has been cancelled.",
        });
      }
      const now = new Date();
      if (!isPubliclyBookable(found.cls.startsAt, now)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "That class starts too soon to book online.",
        });
      }
      const timeZone = academy.timeZone
        ? resolveAcademyTimeZone(academy.timeZone)
        : FALLBACK_TIME_ZONE;
      let booked;
      try {
        booked = await ctx.baseDb.transaction(async (tx) => {
          const result = await bookVisitor(
            {
              academyId: academy.academyId,
              firstName: input.booking.firstName,
              lastName: input.booking.lastName,
              phone,
              email: input.booking.email,
              consent: input.booking.consent,
              source: input.booking.source,
              classId: input.booking.classId,
              cancelToken: randomBytes(24).toString("base64url"),
            },
            tx,
          );
          const host =
            ctx.headers.get("x-forwarded-host") ?? ctx.headers.get("host");
          const protocol = ctx.headers.get("x-forwarded-proto") ?? "https";
          const statusUrl = host
            ? `${protocol}://${host}/book/${academy.publicCode}?booking=${encodeURIComponent(result.cancelToken)}`
            : `/book/${academy.publicCode}?booking=${encodeURIComponent(result.cancelToken)}`;
          const notice = await createNotice(
            {
              academyId: academy.academyId,
              eventKey: `visitor_booking_confirmed:${result.visitId}`,
              kind: "visitor_booking_confirmed",
              subject: `Booking confirmed: ${found.cls.title}`,
              body: `You are booked at ${academy.name} for ${found.cls.title} on ${formatWhen(found.cls.startsAt, timeZone)}. View or cancel your booking: ${statusUrl}`,
              templateVersion: "1",
              recipients: [
                {
                  recipientKey: `visitor:${result.visitId}`,
                  visitId: result.visitId,
                  email: input.booking.email,
                },
              ],
            },
            tx,
          );
          return { ...result, noticeId: notice.noticeId };
        });
      } catch (error) {
        if (error instanceof Error && error.message === "Class is full") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "That class is full.",
          });
        }
        if (
          error instanceof Error &&
          error.message === "Class is no longer open for booking"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "That class is no longer open for booking.",
          });
        }
        throw error;
      }
      await deliverNoticeBatch(ctx.baseDb, sendEmail, {
        noticeId: booked.noticeId,
        mode: "remaining",
      });
      return {
        bookingId: booked.visitId,
        token: booked.cancelToken,
        class: {
          title: found.cls.title,
          startsAt: publicInstant(found.cls.startsAt, timeZone),
          durationMinutes: found.cls.durationMinutes,
        },
      };
    }),

  cancel: publicProcedure
    .use(rateLimited(10, 60 * 60_000))
    .input(TokenSchema)
    .mutation(async ({ ctx, input }) => {
      limited(`visitor:cancel:${clientIp(ctx.headers)}`, 10, 60 * 60_000);
      const academy = await academyFor(input.code, ctx.baseDb);
      await ctx.baseDb.transaction((tx) =>
        cancelVisitorBooking(academy.academyId, input.token, tx),
      );
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
