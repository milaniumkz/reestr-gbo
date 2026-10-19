import { afterEach, describe, it, expect, jest } from "@jest/globals";
import { PhotoAnalysisLimiter } from "./photo-analysis-limiter";
afterEach(() => jest.useRealTimers());
describe("bounded photo admission", () => {
  it("processes queued requests in order and never exceeds the native decoder limit", async () => {
    const limiter = new PhotoAnalysisLimiter(2, 2);
    const a = await limiter.acquire(),
      b = await limiter.acquire();
    const order: string[] = [];
    const c = limiter.acquire().then((release) => {
      order.push("c");
      return release;
    });
    const d = limiter.acquire().then((release) => {
      order.push("d");
      return release;
    });
    expect(limiter.status()).toMatchObject({ active: 2, waiting: 2 });
    await expect(limiter.acquire()).rejects.toThrow("Очередь");
    a();
    const releaseC = await c;
    expect(order).toEqual(["c"]);
    expect(limiter.status()).toMatchObject({ active: 2, waiting: 1 });
    b();
    const releaseD = await d;
    expect(order).toEqual(["c", "d"]);
    releaseC();
    releaseD();
    expect(limiter.status()).toMatchObject({ active: 0, waiting: 0 });
  });
  it("removes timed-out waiters and recovers for subsequent requests", async () => {
    jest.useFakeTimers();
    const limiter = new PhotoAnalysisLimiter(1, 1, 50);
    const release = await limiter.acquire();
    const timedOut = expect(limiter.acquire()).rejects.toThrow("Очередь");
    jest.advanceTimersByTime(51);
    await timedOut;
    expect(limiter.status()).toMatchObject({ active: 1, waiting: 0 });
    release();
    const next = await limiter.acquire();
    next();
    expect(limiter.status().active).toBe(0);
  });
  it("does not free another upload slot when release is called twice", async () => {
    const limiter = new PhotoAnalysisLimiter(1, 1);
    const release = await limiter.acquire(),
      waiting = limiter.acquire();
    release();
    release();
    const next = await waiting;
    expect(limiter.status().active).toBe(1);
    next();
    expect(limiter.status().active).toBe(0);
  });
});
