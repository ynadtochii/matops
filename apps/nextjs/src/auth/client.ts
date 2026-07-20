import {
  magicLinkClient,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { ac, roles } from "@matops/auth/permissions";

export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles }), magicLinkClient()],
});
