/**
 * Meal photos live at `{userId}/{filename}` in a private bucket. Storage RLS
 * enforces that on upload; this is the matching check on the way in, so a
 * client cannot attach someone else's photo to its own entry by sending a
 * path it doesn't own (design doc §10.1, §10.5).
 */

/** A single path segment: no traversal, no nesting, no empty names. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

export function isOwnedPhotoPath(path: string, userId: string): boolean {
  if (path.length === 0 || path.length > 300) return false;
  if (path.includes("..") || path.includes("//") || path.startsWith("/")) return false;

  const segments = path.split("/");
  if (segments.length !== 2) return false;

  const [owner, filename] = segments;
  if (owner !== userId) return false;
  return filename !== undefined && SEGMENT.test(filename);
}
