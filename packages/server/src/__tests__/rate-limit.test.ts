import { describe, expect, it } from "vitest";
import { RateLimiter } from "../middleware/rate-limit.js";

describe("RateLimiter", () => {
  it("allows up to the limit then refuses", () => {
    let t = 0;
    const limiter = new RateLimiter(3, 1000, () => t);
    expect(limiter.check("u1").allowed).toBe(true);
    expect(limiter.check("u1").allowed).toBe(true);
    expect(limiter.check("u1").allowed).toBe(true);
    expect(limiter.check("u1").allowed).toBe(false);
  });

  it("counts each user separately", () => {
    const limiter = new RateLimiter(1, 1000, () => 0);
    expect(limiter.check("u1").allowed).toBe(true);
    expect(limiter.check("u2").allowed).toBe(true);
    expect(limiter.check("u1").allowed).toBe(false);
  });

  it("opens a fresh window once the old one passes", () => {
    let t = 0;
    const limiter = new RateLimiter(1, 1000, () => t);
    expect(limiter.check("u1").allowed).toBe(true);
    expect(limiter.check("u1").allowed).toBe(false);
    t = 1001;
    expect(limiter.check("u1").allowed).toBe(true);
  });

  it("reports what is left and when it resets", () => {
    const limiter = new RateLimiter(2, 5000, () => 1000);
    expect(limiter.check("u1")).toEqual({ allowed: true, remaining: 1, resetAt: 6000 });
  });

  it("prunes expired windows so it cannot grow without bound", () => {
    let t = 0;
    const limiter = new RateLimiter(1, 100, () => t);
    limiter.check("u1");
    limiter.check("u2");
    expect(limiter.size).toBe(2);
    t = 200;
    limiter.prune();
    expect(limiter.size).toBe(0);
  });
});
