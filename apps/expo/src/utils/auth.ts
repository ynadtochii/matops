import * as SecureStore from "expo-secure-store";
import { expoClient } from "@better-auth/expo/client";
import {
  inferAdditionalFields,
  magicLinkClient,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { ac, roles } from "@matops/auth/permissions";

import { getBaseUrl } from "./base-url";

export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
  plugins: [
    // Mirrors the server's user additional field (packages/auth) so
    // `session.user.phone` is typed on the client. Kept as an explicit schema to
    // avoid importing the heavy server `Auth` type into the app.
    inferAdditionalFields({
      user: { phone: { type: "string", required: false } },
    }),
    organizationClient({ ac, roles }),
    magicLinkClient(),
    expoClient({
      scheme: "matops",
      storagePrefix: "matops",
      storage: SecureStore,
    }),
  ],
});
