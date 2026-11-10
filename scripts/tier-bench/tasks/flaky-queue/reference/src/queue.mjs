// An asynchronous job queue with retries.
//
//   const queue = new JobQueue({ concurrency, retries, backoffMs, timeoutMs, timers });
//
//   concurrency  how many jobs may run at the same time (default 1)
//   retries      how many more times a failed job is tried (default 0): a job runs at most retries + 1 times
//   backoffMs    how long a failed job waits before its next try (default 0), the same every time
//   timeoutMs    an attempt that has not finished this long after it started counts as failed, with
//                new Error('job timed out'); 0 (the default) means no limit. The function is not stopped, but
//                whatever it does later is ignored
//   timers       { setTimeout, clearTimeout }, so that tests can drive time (default: the global ones)
//
//   queue.add(fn)   fn() is called with no arguments and may return a value or a promise, or throw. Returns a
//                   promise of fn's value, or, when the last try has failed, of the error of that last try
//                   (rejected with exactly what fn threw or rejected with). Jobs start in the order they were added.
//   queue.drain()   returns a promise that resolves once every job added before the call has settled, retries
//                   and waiting for backoff included. With nothing to wait for it resolves at once.
//
// While a job waits for its backoff it does not hold one of the `concurrency` places.

export class JobQueue {
  #concurrency;
  #retries;
  #backoffMs;
  #timeoutMs;
  #timers;
  #waiting = []; // jobs ready to start, in order
  #running = 0; // attempts in progress
  #backingOff = 0; // failed jobs waiting for their backoff timer, which are neither running nor waiting
  #drainers = []; // resolve functions of the drain() calls waiting for the queue to be idle

  constructor({ concurrency = 1, retries = 0, backoffMs = 0, timeoutMs = 0, timers } = {}) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('concurrency must be a positive integer');
    this.#concurrency = concurrency;
    this.#retries = retries;
    this.#backoffMs = backoffMs;
    this.#timeoutMs = timeoutMs;
    this.#timers = timers ?? { setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) };
  }

  add(fn) {
    return new Promise((resolve, reject) => {
      this.#waiting.push({ fn, resolve, reject, attempts: 0 });
      this.#pump();
    });
  }

  drain() {
    return new Promise((resolve) => {
      this.#drainers.push(resolve);
      this.#pump();
    });
  }

  // Starts what can start, then wakes the drain() calls if there is nothing left to do.
  #pump() {
    while (this.#running < this.#concurrency && this.#waiting.length > 0) {
      this.#run(this.#waiting.shift());
    }
    if (this.#running === 0 && this.#waiting.length === 0 && this.#backingOff === 0) {
      for (const resolve of this.#drainers.splice(0)) resolve();
    }
  }

  #run(job) {
    this.#running++;
    job.attempts++;
    let timer;
    let ended = false;

    // Called when the attempt succeeded, failed or timed out; only the first call counts.
    const end = (ok, valueOrError) => {
      if (ended) return;
      ended = true;
      if (timer !== undefined) this.#timers.clearTimeout(timer);
      this.#running--;
      if (ok) {
        job.resolve(valueOrError);
      } else if (job.attempts <= this.#retries) {
        this.#backingOff++;
        this.#timers.setTimeout(() => {
          this.#backingOff--;
          this.#waiting.push(job);
          this.#pump();
        }, this.#backoffMs);
      } else {
        job.reject(valueOrError);
      }
      this.#pump();
    };

    if (this.#timeoutMs > 0) {
      timer = this.#timers.setTimeout(() => end(false, new Error('job timed out')), this.#timeoutMs);
    }
    let result;
    try {
      result = Promise.resolve(job.fn());
    } catch (error) {
      result = Promise.reject(error);
    }
    result.then(
      (value) => end(true, value),
      (error) => end(false, error),
    );
  }
}
