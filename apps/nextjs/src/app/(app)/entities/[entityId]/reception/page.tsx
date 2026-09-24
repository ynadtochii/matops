import type { EntityPageProps } from "~/trpc/server";
import { PageHeader } from "~/app/_components/page-header";
import { StaffReception } from "~/app/_components/staff-reception";
import { setRequestEntity } from "~/trpc/server";

export default async function StaffReceptionPage({ params }: EntityPageProps) {
  setRequestEntity((await params).entityId);

  return (
    <>
      <PageHeader
        title="Reception"
        subtitle="Check members into a class from the desk."
      />
      <StaffReception />
    </>
  );
}
