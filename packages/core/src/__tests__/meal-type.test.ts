import { describe, expect, it } from "vitest";
import { inferMealType, localDateKey, localHour } from "../meal-type.js";

/** Dublin is UTC+1 in September (IST), so 07:15 UTC is 08:15 local. */
describe("inferMealType", () => {
  it("reads 08:15 local as breakfast", () => {
    expect(inferMealType(new Date("2026-09-03T07:15:00Z"))).toBe("breakfast");
  });

  it("reads 13:02 local as lunch", () => {
    expect(inferMealType(new Date("2026-09-03T12:02:00Z"))).toBe("lunch");
  });

  it("reads 19:40 local as dinner", () => {
    expect(inferMealType(new Date("2026-09-03T18:40:00Z"))).toBe("dinner");
  });

  it("reads mid-afternoon and late night as snacks", () => {
    expect(inferMealType(new Date("2026-09-03T14:45:00Z"))).toBe("snack"); // 15:45 local
    expect(inferMealType(new Date("2026-09-03T22:30:00Z"))).toBe("snack"); // 23:30 local
    expect(inferMealType(new Date("2026-09-03T01:30:00Z"))).toBe("snack"); // 02:30 local
  });

  it("respects the time zone, not the server's clock", () => {
    const t = new Date("2026-09-03T23:30:00Z"); // 00:30 in Dublin, 19:30 in New York
    expect(inferMealType(t, "Europe/Dublin")).toBe("snack");
    expect(inferMealType(t, "America/New_York")).toBe("dinner");
  });

  it("handles the winter offset, when Dublin is UTC", () => {
    expect(localHour(new Date("2026-01-15T08:00:00Z"))).toBe(8);
  });
});

describe("localDateKey", () => {
  it("uses the local calendar day, not UTC's", () => {
    const t = new Date("2026-09-03T23:30:00Z"); // 00:30 on the 4th in Dublin
    expect(localDateKey(t, "Europe/Dublin")).toBe("2026-09-04");
    expect(localDateKey(t, "America/New_York")).toBe("2026-09-03");
  });
});
