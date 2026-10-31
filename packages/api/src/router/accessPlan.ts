import type { TRPCRouterRecord } from "@trpc/server";

import { planCatalogProcedures } from "./access-plan/catalog";
import { planHolderProcedures } from "./access-plan/holders";
import { monthPaymentProcedures } from "./access-plan/months";
import { membershipPolicyProcedures } from "./access-plan/policy";

export { assignOne, lockAssignmentsOf } from "./access-plan/holders";

export const accessPlanRouter = {
  ...planCatalogProcedures,
  ...planHolderProcedures,
  ...monthPaymentProcedures,
  ...membershipPolicyProcedures,
} satisfies TRPCRouterRecord;
