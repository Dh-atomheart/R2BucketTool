export function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "") || "image";
}
