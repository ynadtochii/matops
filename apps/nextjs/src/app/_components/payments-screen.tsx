"use client";

import { useEntity } from "./entity";
import { MyDues } from "./my-dues";
import { PageHeader } from "./page-header";
import { EmptyState } from "./states";

export function PaymentsScreen() {
  const { membershipEnforced } = useEntity();
  if (!membershipEnforced) {
    return (
      <>
        <PageHeader title="Membership" />
        <EmptyState title="This academy does not take payments in MatOps." />
      </>
    );
  }
  return <MyDues />;
}
