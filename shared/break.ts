// Try to break it: before a result counts, an agent that did none of the work looks for other explanations of the
// gain, runs the controls and reports what survived. The Compare window of Experiments starts that session
// (web/src/features/experiments/BreakDialog.tsx) with this request; the method is the break-the-result skill.

export interface BreakAsk {
  /** The result to test, in the person's words: "lr 3e-5 beats the baseline on ndcg@10: 0.431 against 0.412". */
  claim: string;
  /** The runs it rests on, the baseline among them. */
  runs: { id: string; name: string; group?: string }[];
  /** The id of the run it is measured against. */
  baseline?: string;
  /** The number it is about ("ndcg@10"), when known. */
  metric?: string;
  /** The folder the runs ran in, when it is on this computer. */
  cwd?: string;
}

/** On one line: a name is its maker's text, and stays inside its own line of the request. */
const line = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The request a "Try to break it" session starts with. */
export function breakRequest(a: BreakAsk): string {
  // Under a prompt key: words for the agent, which the pages' translations leave out (scripts/i18n-extract.mjs).
  const ask = {
    prompt: [
      `Try to break this result: ${a.claim.trim()}`,
      '',
      'You did none of the work behind it. Find out whether it is real, as the break-the-result skill says: load it first.',
      '',
      'The runs it rests on, in Experiments (read each with experiment_get before anything else):',
      ...a.runs.map((r) => {
        const group = r.group ? `, experiment ${line(r.group)}` : '';
        return `- ${r.id}: ${line(r.name)}${group}${r.id === a.baseline ? ' (the baseline)' : ''}`;
      }),
      ...(a.metric ? [`The number it is about: ${line(a.metric)}.`] : []),
      ...(a.cwd ? [`They ran in this folder: ${a.cwd}`] : []),
      '',
      '- Say the claim exactly, then list what else could explain it, the cheapest to check first.',
      '- Run the controls through Experiments, in an experiment of their own (the claim’s experiment’s name with “-controls” added, each run tagged control), on the CPU when they can be. Ask before spending much GPU time, with the GPU hours as choices.',
      '- Work in a worktree or copy of your own: never change the person’s checkout, and never touch a final test or held-out data.',
      '- Repair nothing. Report first “It holds”, “It holds in part” or “It does not hold”, then what you tried, what it showed and what was not checked.',
    ],
  };
  return ask.prompt.join('\n');
}
