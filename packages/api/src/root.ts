import { academyRouter } from "./router/academy";
import { accessPlanRouter } from "./router/accessPlan";
import { accountRouter } from "./router/account";
import { attendanceRouter } from "./router/attendance";
import { authRouter } from "./router/auth";
import { bookingRouter } from "./router/booking";
import { checkinRouter } from "./router/checkin";
import { classRouter } from "./router/class";
import { curriculumRouter } from "./router/curriculum";
import { dataTransferRouter } from "./router/dataTransfer";
import { dropInRouter } from "./router/dropin";
import { entityRouter } from "./router/entity";
import { inviteRouter } from "./router/invite";
import { membershipRouter } from "./router/membership";
import { noteRouter } from "./router/note";
import { notificationRouter } from "./router/notification";
import { organizationRouter } from "./router/organization";
import { personRouter } from "./router/person";
import { pushTokenRouter } from "./router/pushToken";
import { rankRouter } from "./router/rank";
import { receptionRouter } from "./router/reception";
import { referralRouter } from "./router/referral";
import { statsRouter } from "./router/stats";
import { templateRouter } from "./router/template";
import { visitorRouter } from "./router/visitor";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  academy: academyRouter,
  entity: entityRouter,
  organization: organizationRouter,
  accessPlan: accessPlanRouter,
  account: accountRouter,
  invite: inviteRouter,
  membership: membershipRouter,
  template: templateRouter,
  class: classRouter,
  curriculum: curriculumRouter,
  dataTransfer: dataTransferRouter,
  booking: bookingRouter,
  attendance: attendanceRouter,
  checkin: checkinRouter,
  reception: receptionRouter,
  person: personRouter,
  rank: rankRouter,
  referral: referralRouter,
  note: noteRouter,
  notification: notificationRouter,
  dropIn: dropInRouter,
  pushToken: pushTokenRouter,
  stats: statsRouter,
  visitor: visitorRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
