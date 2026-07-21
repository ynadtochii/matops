import { academyRouter } from "./router/academy";
import { attendanceRouter } from "./router/attendance";
import { authRouter } from "./router/auth";
import { bookingRouter } from "./router/booking";
import { checkinRouter } from "./router/checkin";
import { classRouter } from "./router/class";
import { dropInRouter } from "./router/dropin";
import { inviteRouter } from "./router/invite";
import { membershipRouter } from "./router/membership";
import { systemRouter } from "./router/system";
import { templateRouter } from "./router/template";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  academy: academyRouter,
  invite: inviteRouter,
  membership: membershipRouter,
  template: templateRouter,
  class: classRouter,
  booking: bookingRouter,
  attendance: attendanceRouter,
  checkin: checkinRouter,
  dropIn: dropInRouter,
  system: systemRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
