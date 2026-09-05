import { describe, expect, it } from "vitest";
import { isOwnedPhotoPath } from "@awe/core";

/**
 * The route-level guard on POST /meals/photo. Storage RLS already stops a
 * client writing into another user's folder; this stops it attaching a path
 * it doesn't own to an entry of its own, which RLS cannot see.
 */
describe("photo path ownership, as the route applies it", () => {
  const me = "3f1c2b7a-9d4e-4a11-8c3f-2b7a9d4e4a11";
  const them = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  const routeAccepts = (path: string, userId: string) => path === "" || isOwnedPhotoPath(path, userId);

  it("accepts a path the caller uploaded", () => {
    expect(routeAccepts(`${me}/2026-09-03T18-40-00-000Z-a1b2c3.jpg`, me)).toBe(true);
  });

  it("accepts an empty path, meaning the upload failed and the estimate is still worth keeping", () => {
    expect(routeAccepts("", me)).toBe(true);
  });

  it("refuses to attach someone else's photo", () => {
    expect(routeAccepts(`${them}/photo.jpg`, me)).toBe(false);
  });

  it("refuses a traversal dressed up as the caller's own folder", () => {
    expect(routeAccepts(`${me}/../${them}/photo.jpg`, me)).toBe(false);
  });

  it("refuses the local device URI the app sent before uploads existed", () => {
    expect(routeAccepts("file:///var/mobile/Containers/Data/photo.jpg", me)).toBe(false);
  });
});
