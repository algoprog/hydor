// How an agent's how_to_make reads as a step of its work: the kind it read how to make (a SWOT slide, a cover letter),
// or the list of every kind.
export function howToMakeStep(t: { status: string; input?: unknown }) {
  const what = (t.input as { what?: unknown } | undefined)?.what;
  const w = typeof what === 'string' ? what.trim().slice(0, 60) : '';
  return {
    category: 'read' as const,
    verb: t.status === 'running' || t.status === 'pending' ? 'Reading' : 'Read',
    title: w ? `how to make “${w}”` : 'the kinds the app knows how to make',
  };
}
