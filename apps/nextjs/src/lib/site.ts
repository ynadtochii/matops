import { env } from "~/env";

export const INDEXABLE = env.VERCEL_ENV === "production";

export const SITE_URL = INDEXABLE
  ? "https://matops.app"
  : "http://localhost:3004";

export const SITE_DESCRIPTION =
  "MatOps is BJJ gym management software. Run your class schedule, approve students, take bookings and track attendance for your jiu-jitsu academy.";

export const GA_MEASUREMENT_ID = "G-FX62B9MRFV";
