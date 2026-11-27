// Ask an agent to write it: the experiment's page, when runs are done and no finding says what they showed, opens the
// start page with this request in its box, not sent (as shared/asked-runs.ts does for experiments handed to an agent).

/** The request: read the runs of the experiment and record what it showed. The name stays on its own line of it. */
export function findingRequest(experiment: string): string {
  const name = experiment.replace(/\s+/g, ' ').trim().slice(0, 120);
  // Under a prompt key: words for the agent, which the pages' translations leave out (scripts/i18n-extract.mjs).
  const ask = {
    prompt: [
      `Read the runs of the experiment “${name}” with experiment_list and experiment_get, make a results table if it helps, and record what it showed with finding_record: the verdict, what was learned, and the runs as evidence. Do not start new runs.`,
    ],
  };
  return ask.prompt.join('\n');
}
