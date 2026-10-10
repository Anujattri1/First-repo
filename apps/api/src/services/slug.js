// Slug helper shared by seed + routes.
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

export function uniqueSlug(base, exists) {
  let slug = slugify(base), n = 1;
  while (exists(slug)) slug = `${slugify(base)}-${++n}`;
  return slug;
}
