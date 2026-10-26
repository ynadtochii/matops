export function canCreateGym(
  email: string,
  allowlist: string | undefined,
): boolean {
  const wanted = email.trim().toLowerCase();
  if (!wanted || !allowlist) return false;
  return allowlist
    .split(",")
    .some((entry) => entry.trim().toLowerCase() === wanted);
}
