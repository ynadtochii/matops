import { academyRouter } from "./router/academy";
import { accessPlanRouter } from "./router/accessPlan";
import { accountRouter } from "./router/account";
import { attendanceRouter } from "./router/attendance";
import { bookingRouter } from "./router/booking";
import { cardPaymentRouter } from "./router/cardPayment";
import { checkinRouter } from "./router/checkin";
import { classRouter } from "./router/class";
import { dataTransferRouter } from "./router/dataTransfer";
import { deskRouter } from "./router/desk";
import { disciplineRouter } from "./router/discipline";
import { dropInRouter } from "./router/dropin";
import { entityRouter } from "./router/entity";
import { inviteRouter } from "./router/invite";
import { membershipRouter } from "./router/membership";
import { noteRouter } from "./router/note";
import { notificationRouter } from "./router/notification";
import { organizationRouter } from "./router/organization";
import { pushTokenRouter } from "./router/pushToken";
import { rankRouter } from "./router/rank";
import { statsRouter } from "./router/stats";
import { storageRouter } from "./router/storage";
import { templateRouter } from "./router/template";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  academy: academyRouter,
  entity: entityRouter,
  organization: organizationRouter,
  accessPlan: accessPlanRouter,
  account: accountRouter,
  invite: inviteRouter,
  membership: membershipRouter,
  template: templateRouter,
  class: classRouter,
  discipline: disciplineRouter,
  dataTransfer: dataTransferRouter,
  booking: bookingRouter,
  attendance: attendanceRouter,
  checkin: checkinRouter,
  rank: rankRouter,
  note: noteRouter,
  notification: notificationRouter,
  desk: deskRouter,
  dropIn: dropInRouter,
  pushToken: pushTokenRouter,
  stats: statsRouter,
  storage: storageRouter,
  cardPayment: cardPaymentRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
