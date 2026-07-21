/**
 * Turn an academy name into a URL-safe slug fragment. Pure — the caller appends a
 * random suffix for global uniqueness (Better Auth requires a unique org slug).
 * Returns "academy" when the name has no usable characters (e.g. all symbols).
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accent marks
    .replace(/[^a-z0-9]+/g, "-") // runs of non-alphanumerics → one dash
    .replace(/^-+|-+$/g, "") // trim leading/trailing dashes
    .slice(0, 48);
  return slug || "academy";
}
