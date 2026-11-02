// Where a step is in a template's flow, for the editors (the steps list and the graph): a list of steps is
// named by its path from the flow's own ([] the flow's steps, [2, "then"] the Then of the step at 2), and the
// flow changes by editing one list in place.
import type { Step } from '@shared/app-manifest';

/** Where a list of steps is: [] the flow's own; [i, key, …] a list inside the step at i (then, else, steps, failed, b0, b1… for branches). */
export type ListPath = (number | string)[];

export function childList(s: Step, key: string): Step[] {
  if (key === 'failed') return Array.isArray(s.failed) ? s.failed : [];
  if (s.do === 'decide') return key === 'then' ? s.then : key === 'else' ? (s.else ?? []) : [];
  if (s.do === 'repeat') return key === 'steps' ? s.steps : [];
  if (s.do === 'parallel' && key.startsWith('b')) return s.branches[Number(key.slice(1))] ?? [];
  return [];
}

export function withChild(s: Step, key: string, list: Step[]): Step {
  if (key === 'failed') return { ...s, failed: list };
  if (s.do === 'decide') return key === 'then' ? { ...s, then: list } : { ...s, else: list };
  if (s.do === 'repeat') return { ...s, steps: list };
  if (s.do === 'parallel') return { ...s, branches: s.branches.map((b, n) => (`b${n}` === key ? list : b)) };
  return s;
}

export function editList(steps: Step[], path: ListPath, f: (list: Step[]) => Step[]): Step[] {
  if (!path.length) return f(steps);
  const [i, key, ...rest] = path as [number, string, ...ListPath];
  return steps.map((s, j) => (j === i ? withChild(s, key, editList(childList(s, key), rest, f)) : s));
}

/** The lists inside a step, each with what to call it. */
export function listsOf(s: Step): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  if (s.do === 'decide') out.push({ key: 'then', label: 'Then' }, { key: 'else', label: 'Otherwise' });
  if (s.do === 'repeat') out.push({ key: 'steps', label: s.over !== undefined ? 'For each item' : 'Each round' });
  if (s.do === 'parallel') s.branches.forEach((_, n) => out.push({ key: `b${n}`, label: `Branch ${n + 1}` }));
  if (Array.isArray(s.failed)) out.push({ key: 'failed', label: 'If it fails, instead' });
  return out;
}

/** A list with one item moved by `by` places. */
export const move = <T>(list: T[], i: number, by: number) => {
  const next = [...list];
  const [x] = next.splice(i, 1);
  next.splice(i + by, 0, x);
  return next;
};
