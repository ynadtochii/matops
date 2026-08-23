import { academyRouter } from "./router/academy";
import { accountRouter } from "./router/account";
import { attendanceRouter } from "./router/attendance";
import { authRouter } from "./router/auth";
import { bookingRouter } from "./router/booking";
import { checkinRouter } from "./router/checkin";
import { classRouter } from "./router/class";
import { dropInRouter } from "./router/dropin";
import { inviteRouter } from "./router/invite";
import { membershipRouter } from "./router/membership";
import { noteRouter } from "./router/note";
import { notificationRouter } from "./router/notification";
import { paymentsRouter } from "./router/payments";
import { pushTokenRouter } from "./router/pushToken";
import { rankRouter } from "./router/rank";
import { referralRouter } from "./router/referral";
import { statsRouter } from "./router/stats";
import { systemRouter } from "./router/system";
import { templateRouter } from "./router/template";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  academy: academyRouter,
  account: accountRouter,
  invite: inviteRouter,
  membership: membershipRouter,
  template: templateRouter,
  class: classRouter,
  booking: bookingRouter,
  attendance: attendanceRouter,
  checkin: checkinRouter,
  payments: paymentsRouter,
  rank: rankRouter,
  referral: referralRouter,
  note: noteRouter,
  notification: notificationRouter,
  dropIn: dropInRouter,
  pushToken: pushTokenRouter,
  stats: statsRouter,
  system: systemRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
