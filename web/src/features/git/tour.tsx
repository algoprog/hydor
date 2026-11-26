// The Git page's short tour (features/tips/PageTour), for people new to Git: what it keeps and why, then each part of
// the page in plain words, ending with asking an agent to do it for you. Its parts are marked data-intro="git-…".
import type { IntroStep } from '../tips/PageTour';

/** Save points along a line, with one branch that leaves it and joins it again. */
function SavePoints() {
  return (
    <svg viewBox="0 0 220 80" width={220} height={80} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="max-w-full text-fg-3" aria-hidden>
      <path d="M14 56H206" />
      <path className="text-accent" d="M52 56C72 56 70 24 92 24H128C150 24 148 56 168 56" />
      {[24, 52, 110, 168].map((x) => (
        <circle key={x} cx={x} cy={56} r={6} fill="var(--elevated)" />
      ))}
      <g className="text-accent">
        <circle cx={96} cy={24} r={6} fill="var(--elevated)" />
        <circle cx={124} cy={24} r={6} fill="var(--elevated)" />
        <circle cx={200} cy={56} r={7} fill="currentColor" />
      </g>
    </svg>
  );
}

export const GIT_TOUR: IntroStep[] = [
  {
    title: 'Git keeps every version of your work',
    body: 'Think of it as save points for a folder. Each save point (a commit) keeps what every file looked like at that moment, with a short note on what changed, so you can always look back or return to an earlier version. A folder that Git looks after is called a repository.',
    Picture: SavePoints,
  },
  {
    target: ['git-repos', 'git-add'],
    title: 'Your repositories',
    body: 'The folders your sessions work in that Git looks after, each with how many files changed since its last save point. Pick one to open it, or add another folder.',
  },
  {
    target: 'git-changes',
    title: 'Changes: what is new since the last save point',
    body: 'Every file you or an agent changed, with the lines taken out in red and the lines added in green. Nothing here is lost: it is just not saved as a version yet.',
  },
  {
    target: 'git-commit',
    title: 'Commit: make a save point',
    body: 'Write a few words about what changed and press Commit. That version is kept for good, and you can come back to it whenever you like.',
  },
  {
    target: 'git-sync',
    title: 'Keep a copy online',
    body: 'If the repository has a copy on GitHub or another site (its remote), Sync sends your save points there and brings in the ones made elsewhere; Push and Pull, in the menu beside it, go one way only. Nothing leaves this computer until you sync or push.',
  },
  {
    target: 'git-history',
    title: 'History: every save point, newest first',
    body: 'Who made each one, when, and what it changed. Open one to see the files as they were then, or to undo it.',
  },
  {
    target: 'git-branches',
    title: 'Branches: try an idea without risk',
    body: 'A branch is a separate line of work. Try something on one while the main version stays as it was, then bring it in when it works, or drop it if it does not.',
  },
  {
    target: 'git-tour',
    title: 'Or just ask an agent',
    body: 'You never need to learn Git’s commands. In any session, say “save my changes with a note”, “undo what you changed in the report” or “put this project on GitHub”, and the agent does it. Show me around brings this tour back.',
  },
];
