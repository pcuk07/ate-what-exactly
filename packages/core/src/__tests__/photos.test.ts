import { describe, expect, it } from "vitest";
import { isOwnedPhotoPath } from "../photos.js";

const user = "3f1c2b7a-9d4e-4a11-8c3f-2b7a9d4e4a11";
const other = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("isOwnedPhotoPath", () => {
  it("accepts a path in the caller's own folder", () => {
    expect(isOwnedPhotoPath(`${user}/2026-09-03T18-40-00-000Z-a1b2c3.jpg`, user)).toBe(true);
  });

  it("rejects another user's folder", () => {
    expect(isOwnedPhotoPath(`${other}/photo.jpg`, user)).toBe(false);
  });

  it("rejects traversal out of the folder", () => {
    expect(isOwnedPhotoPath(`${user}/../${other}/photo.jpg`, user)).toBe(false);
    expect(isOwnedPhotoPath(`${user}/..`, user)).toBe(false);
  });

  it("rejects nesting below the user folder", () => {
    expect(isOwnedPhotoPath(`${user}/sub/photo.jpg`, user)).toBe(false);
  });

  it("rejects a bare filename with no owner", () => {
    expect(isOwnedPhotoPath("photo.jpg", user)).toBe(false);
  });

  it("rejects a local device URI, which is what the app used to send", () => {
    expect(isOwnedPhotoPath("file:///var/mobile/Containers/photo.jpg", user)).toBe(false);
  });

  it("rejects empty and absurd input", () => {
    expect(isOwnedPhotoPath("", user)).toBe(false);
    expect(isOwnedPhotoPath(`${user}/`, user)).toBe(false);
    expect(isOwnedPhotoPath(`${user}/${"a".repeat(400)}.jpg`, user)).toBe(false);
  });

  it("rejects a doubled slash that could confuse a naive prefix check", () => {
    expect(isOwnedPhotoPath(`${user}//photo.jpg`, user)).toBe(false);
  });

  it("rejects a folder that merely starts with the user id", () => {
    expect(isOwnedPhotoPath(`${user}-evil/photo.jpg`, user)).toBe(false);
  });
});
