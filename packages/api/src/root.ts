import { authRouter } from "./router/auth";
import { postRouter } from "./router/post";
import { systemRouter } from "./router/system";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  post: postRouter,
  system: systemRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
