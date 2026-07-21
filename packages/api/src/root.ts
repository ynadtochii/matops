import { academyRouter } from "./router/academy";
import { authRouter } from "./router/auth";
import { classRouter } from "./router/class";
import { inviteRouter } from "./router/invite";
import { membershipRouter } from "./router/membership";
import { postRouter } from "./router/post";
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
  // Demo router from the scaffold — still used by the Expo demo screens. Retire
  // it in the mobile pass (Phase 1 web-first defers Expo). See docs/roadmap.md.
  post: postRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
