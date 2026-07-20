import * as SecureStore from "expo-secure-store";
import { expoClient } from "@better-auth/expo/client";
import {
  magicLinkClient,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { ac, roles } from "@matops/auth/permissions";

import { getBaseUrl } from "./base-url";

export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
  plugins: [
    organizationClient({ ac, roles }),
    magicLinkClient(),
    expoClient({
      scheme: "expo",
      storagePrefix: "expo",
      storage: SecureStore,
    }),
  ],
});
