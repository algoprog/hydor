// pickJobs(jobs) decides which jobs the shop accepts for the day.
//
// A job is { id: string, minutes: integer >= 0, due: integer >= 0, profit: integer }. `due` is in minutes from the
// start of the day, and `profit` can be 0 or negative. The shop runs one job at a time from minute 0 with no breaks,
// and a job is on time if it ends at or before its due minute.
//
// It returns { profit, order }: `profit` is the largest total profit of a set of jobs that can all be on time, and
// `order` is the ids of one such set in the order to run them, every job on time.
//
// With the jobs by due time, any set of them is best run in that order, so a set is feasible when it is on time in it.
// That makes it a knapsack over the time used: going through the jobs by due time, best[t] is the largest profit of a
// set of the jobs so far that uses exactly t minutes, and a job can only be added where it then ends by its own due.
export function pickJobs(jobs) {
  // A job that earns nothing, or cannot end by its due time even alone, is never needed.
  const candidates = jobs
    .map((job, index) => ({ job, index }))
    .filter(({ job }) => job.profit > 0 && job.minutes <= job.due)
    .sort((a, b) => a.job.due - b.job.due || a.index - b.index);
  const n = candidates.length;
  if (n === 0) return { profit: 0, order: [] };

  // No set uses more time than all the jobs together, so a later due time than that never matters (and a due time of
  // a billion minutes must not mean a billion cells).
  let total = 0;
  for (const { job } of candidates) total += job.minutes;
  const horizon = Math.min(total, candidates[n - 1].job.due);
  const width = horizon + 1;

  const best = new Float64Array(width).fill(-Infinity);
  best[0] = 0;
  // took[j * width + t] is 1 when job j was added to reach best[t] at its turn.
  const took = new Uint8Array(n * width);
  let reach = 0; // the most time any set of the jobs so far can use
  for (let j = 0; j < n; j++) {
    const { minutes, due, profit } = candidates[j].job;
    reach = Math.min(horizon, reach + minutes);
    const row = j * width;
    for (let t = Math.min(due, reach); t >= minutes; t--) {
      const before = best[t - minutes];
      if (before + profit > best[t]) {
        best[t] = before + profit;
        took[row + t] = 1;
      }
    }
  }

  let bestTime = 0;
  for (let t = 1; t < width; t++) if (best[t] > best[bestTime]) bestTime = t;
  const picked = [];
  for (let j = n - 1, t = bestTime; j >= 0; j--) {
    if (took[j * width + t] === 1) {
      picked.push(candidates[j].job.id);
      t -= candidates[j].job.minutes;
    }
  }
  return { profit: best[bestTime], order: picked.reverse() };
}
