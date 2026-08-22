import { ClassDetail } from "~/app/_components/class-detail";

export default async function ClassPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClassDetail classId={id} />;
}
