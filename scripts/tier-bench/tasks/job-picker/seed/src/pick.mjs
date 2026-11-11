// pickJobs(jobs) decides which jobs the shop accepts for the day.
//
// A job is { id: string, minutes: integer >= 0, due: integer >= 0, profit: integer }. `due` is in minutes from the
// start of the day, and `profit` can be 0 or negative. The shop runs one job at a time from minute 0 with no breaks,
// and a job is on time if it ends at or before its due minute.
//
// It returns { profit, order }: `profit` is the largest total profit of a set of jobs that can all be on time, and
// `order` is the ids of one such set in the order to run them, every job on time.
export function pickJobs(jobs) {
  // With the jobs by due time, any set of them is best run in that order, so a set is feasible when it is on time in it.
  const byDue = jobs.map((job, index) => ({ job, index })).sort((a, b) => a.job.due - b.job.due || a.index - b.index);
  const n = byDue.length;
  let bestProfit = 0;
  let bestMask = 0;
  for (let mask = 0; mask < 2 ** n; mask++) {
    let time = 0;
    let profit = 0;
    let onTime = true;
    for (let i = 0; i < n && onTime; i++) {
      if (Math.floor(mask / 2 ** i) % 2 === 0) continue;
      const { job } = byDue[i];
      time += job.minutes;
      profit += job.profit;
      onTime = time <= job.due;
    }
    // The first set found wins a tie.
    if (onTime && profit > bestProfit) {
      bestProfit = profit;
      bestMask = mask;
    }
  }
  const order = [];
  for (let i = 0; i < n; i++) if (Math.floor(bestMask / 2 ** i) % 2 === 1) order.push(byDue[i].job.id);
  return { profit: bestProfit, order };
}
