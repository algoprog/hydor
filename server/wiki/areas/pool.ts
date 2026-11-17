// A small pool of workers for a wiki's long jobs: up to `workers` of the items are in flight at once, taken in order. The
// pool ends when every item is done, or, once `signal` aborts, when the ones in flight have ended (none is started after).
export interface PoolOptions {
  signal?: AbortSignal;
  /** Which items still need doing, asked each time a worker looks for the next (so a job that went on after a stop skips what was read). */
  skip?: (index: number) => boolean;
}

/** Runs `fn` over the items, up to `workers` at once, in order; `fn` never throws out of the pool (what it throws is returned). */
export async function runPool<T>(items: T[], workers: number, fn: (item: T, index: number) => Promise<void>, o: PoolOptions = {}): Promise<{ error?: unknown }> {
  let next = 0;
  let failure: { error: unknown } | undefined;
  const worker = async () => {
    for (;;) {
      if (o.signal?.aborted || failure) return;
      let i = next++;
      while (i < items.length && o.skip?.(i)) i = next++;
      if (i >= items.length) return;
      try {
        await fn(items[i], i);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, items.length || 1)) }, worker));
  return failure ?? {};
}
