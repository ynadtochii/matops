export const CONTACT_EMAIL = "yevhenii.tech@gmail.com";

export function feedbackMailto({
  academy,
  screen,
}: {
  academy: { name: string; academyId: string; role: string } | null;
  screen: string;
}): string {
  const subject = encodeURIComponent(
    `MatOps feedback: ${academy?.name ?? "the gym"}`,
  );
  const where = academy
    ? `Academy: ${academy.name} (${academy.academyId})\nRole: ${academy.role}\n`
    : "";
  const body = encodeURIComponent(
    `What happened?\n\n\nWhat did you expect?\n\n\n---\n${where}Screen: ${screen}\n`,
  );
  return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
}
