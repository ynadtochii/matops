import { Attendance } from "~/app/_components/attendance";
import { PageHeader } from "~/app/_components/page-header";

export default function AttendancePage() {
  return (
    <>
      <PageHeader title="Attendance" subtitle="Mark who trained — pick a class from the last two weeks." />
      <Attendance />
    </>
  );
}
