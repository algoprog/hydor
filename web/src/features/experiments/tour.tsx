// The Experiments page's short tour (features/tips/PageTour), for people new to training models: what a run and an
// experiment are, then each part of the page in plain words, ending with asking an agent to do it all. Its parts are
// marked data-intro="exp-…" (the Show me around button's is experiments-tour).
import type { IntroStep } from '../tips/PageTour';

/** Three loss curves falling as their runs learn, the best of them in the accent colour. */
function LossCurves() {
  return (
    <svg viewBox="0 0 220 80" width={220} height={80} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="max-w-full text-fg-3" aria-hidden>
      <path d="M12 6V72H208" strokeWidth={1.5} opacity={0.5} />
      <path d="M18 10C44 30 70 33 104 35S170 38 204 37" />
      <path d="M18 14C40 42 66 47 100 51S168 53 204 54" opacity={0.7} />
      <g className="text-accent">
        <path d="M18 12C34 46 60 56 98 61S166 65 204 66" strokeWidth={2.5} />
        <circle cx={204} cy={66} r={3.5} fill="currentColor" />
      </g>
    </svg>
  );
}

export const EXPERIMENTS_TOUR: IntroStep[] = [
  {
    title: 'Experiments: try ideas and compare them',
    body: 'Training or testing an AI model means trying it many times with different settings to find what works best. Each try is a run, and runs that test the same idea make an experiment. This page keeps every run with its settings and results, so nothing gets lost.',
    Picture: LossCurves,
  },
  {
    target: 'exp-new',
    title: 'Start a run',
    body: 'Give it the command that trains or tests your model and pick where it runs: this computer, another of your machines or a cluster. Not sure what to type? Ask an agent, and it writes the command and starts the run for you.',
  },
  {
    target: 'exp-queue',
    title: 'Runs wait their turn',
    body: 'A run waits until a graphics card (GPU) is free, so runs never get in each other’s way, and starts by itself. Here you see what is running, what is waiting and how busy each GPU is.',
  },
  {
    target: 'exp-list',
    title: 'Your experiments',
    body: 'Grouped by what they are about. Open one to see its runs side by side in a table, their charts drawn over each other, and which settings made the most difference.',
  },
  {
    target: 'exp-runs',
    title: 'Follow a run as it goes',
    body: 'Open a run to watch it live: its charts as it learns, what it prints and the numbers it reports. You get a notification when it finishes or fails.',
  },
  {
    title: 'Compare and write it up',
    body: 'Tick two or more runs to compare them, or make a results table: averages over repeated runs with their spread, ready to copy into a paper.',
  },
  {
    target: 'experiments-tour',
    title: 'Let an agent do the work',
    body: 'In any session, ask “train this model with three learning rates and tell me which is best”: the agent starts the runs, waits for them and reports back with a table. Show me around brings this tour back.',
  },
];
