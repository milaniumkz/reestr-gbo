import { ServiceUnavailableException } from "@nestjs/common";

type Waiting = {
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** Bounded FIFO admission: both native decoding concurrency and queued upload memory are limited. */
export class PhotoAnalysisLimiter {
  private active = 0;
  private readonly waiting: Waiting[] = [];
  constructor(
    private readonly capacity = 2,
    private readonly maxWaiting = 4,
    private readonly waitTimeoutMs = 10_000,
  ) {}
  status() {
    return {
      active: this.active,
      waiting: this.waiting.length,
      capacity: this.capacity,
      maxWaiting: this.maxWaiting,
      waitTimeoutMs: this.waitTimeoutMs,
    };
  }
  async acquire(): Promise<() => void> {
    if (this.active < this.capacity) {
      this.active++;
      return this.releaseOnce();
    }
    if (this.waiting.length >= this.maxWaiting) throw this.busy();
    return new Promise((resolve, reject) => {
      const entry: Waiting = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiting.indexOf(entry);
          if (index >= 0) {
            this.waiting.splice(index, 1);
            reject(this.busy());
          }
        }, this.waitTimeoutMs),
      };
      entry.timer.unref();
      this.waiting.push(entry);
    });
  }
  private releaseOnce() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      const next = this.waiting.shift();
      if (next) {
        clearTimeout(next.timer);
        this.active++;
        next.resolve(this.releaseOnce());
      }
    };
  }
  private busy() {
    return new ServiceUnavailableException(
      "Очередь проверки фото занята. Повторите загрузку через несколько секунд",
    );
  }
}
