// An app in plain terms, for someone deciding whether to install it (a file's install card, a ready-made app not
// installed yet): what it asks you, what you get back, how it does its work, and whether agents in your sessions
// can run it for you. The pages put the kinds of work into words (web/src/features/apps/About.tsx).
import type { AppRecipe } from './apps.ts';
import { madeForSessions } from './apps.ts';
import { allSteps } from './app-manifest.ts';
import { pagesFor } from './app-ui.ts';

/** A kind of work it does: a tool by its name, a model's quick answer, an agent, a program… ("one": one agent does it all). */
export type WorkKind = 'one' | 'tool' | 'model' | 'agent' | 'code' | 'parallel' | 'repeat' | 'decide' | 'ask' | 'app' | 'data';

export interface AppSummary {
  /** Its form's questions, in order; `optional`: it can do without (none given, or one it fills in itself). */
  asks: { label: string; optional: boolean }[];
  /** What you get: its view's pages, else its answer's fields. */
  gets: string[];
  /** `gets` are the pages of a view of its own (else the fields of its answer). */
  inView: boolean;
  /** The kinds of work it does, each once, in the order it first does them. */
  how: { kind: WorkKind; tool?: string }[];
  /** How many steps (0: one agent does the task). */
  steps: number;
  /** Agents in your sessions can run it for you (it is made for that). */
  sessions: boolean;
  /** It is used on a page of its own: screens of its own, or a view of what it keeps. */
  ownPage: boolean;
}

export function appSummary(r: AppRecipe): AppSummary {
  const pages = pagesFor(r.ui, 'run').filter((p) => p.tab !== false);
  const steps = r.flow ? allSteps(r.flow.steps) : [];
  const how: AppSummary['how'] = [];
  const add = (kind: WorkKind, tool?: string) => {
    if (!how.some((h) => h.kind === kind && h.tool === tool)) how.push({ kind, ...(tool ? { tool } : {}) });
  };
  if (!r.flow) add('one');
  for (const s of steps) {
    if (s.do === 'tool') add('tool', s.tool);
    else if (s.do !== 'value') add(s.do);
  }
  return {
    asks: r.fields.map((f) => ({ label: f.label, optional: !f.required || !!f.default })),
    gets: pages.length ? pages.map((p) => p.title) : r.answer.map((f) => f.label),
    inView: pages.length > 0,
    how,
    steps: steps.length,
    sessions: madeForSessions(r),
    ownPage: !!r.screens?.main || pagesFor(r.ui, 'app').length > 0,
  };
}
