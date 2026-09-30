import { env } from "~/env";

export const INDEXABLE = env.VERCEL_ENV === "production";

export const SITE_URL = INDEXABLE
  ? "https://matops.app"
  : "http://localhost:3004";

export const SITE_DESCRIPTION =
  "Class schedule, student bookings and attendance for BJJ academies. Students book from their phone, and you approve who trains.";

export const GA_MEASUREMENT_ID = "G-FX62B9MRFV";
