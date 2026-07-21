import { academyRouter } from "./router/academy";
import { authRouter } from "./router/auth";
import { classRouter } from "./router/class";
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
  system: systemRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
