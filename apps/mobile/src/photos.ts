import { decode } from "base64-arraybuffer";
import { supabase } from "./supabase";

/**
 * Meal photos go to a private bucket, one folder per user, and are only ever
 * read back through short-lived signed URLs (design doc §10.1).
 *
 * The first path segment must be the user's own id: that is what the Storage
 * RLS policy checks, and what the server re-checks before saving an entry.
 */
export const MEAL_PHOTO_BUCKET = "meal-photos";

export function mealPhotoPath(userId: string, at: Date = new Date()): string {
  // Timestamp plus randomness: sortable, and two photos in the same second
  // can't collide.
  const stamp = at.toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${userId}/${stamp}-${suffix}.jpg`;
}

export class PhotoUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoUploadError";
  }
}

/**
 * Uploads the already-downscaled JPEG and returns the storage path to record
 * against the entry. The base64 came from the resize step, so no second read
 * of the file is needed.
 */
export async function uploadMealPhoto(userId: string, base64: string): Promise<string> {
  const path = mealPhotoPath(userId);
  const { error } = await supabase.storage
    .from(MEAL_PHOTO_BUCKET)
    .upload(path, decode(base64), { contentType: "image/jpeg", upsert: false });

  if (error) {
    throw new PhotoUploadError(
      "The meal was estimated but the photo couldn't be saved. The entry will be logged without it.",
    );
  }
  return path;
}

/** A short-lived URL for showing a stored photo. Never a public URL. */
export async function signedPhotoUrl(path: string, expiresInSeconds = 60): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(MEAL_PHOTO_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  return error ? null : data.signedUrl;
}
