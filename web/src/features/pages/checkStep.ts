// How an agent's latex_check reads as a step of its work: which paper it checked before submitting.
import { usePagesStore } from './state';

export function latexCheckStep(t: { status: string; input?: unknown }) {
  const a = (t.input ?? {}) as { doc?: unknown; path?: unknown };
  const title = typeof a.doc === 'string' ? usePagesStore.getState().pages?.find((p) => p.id === a.doc)?.title : undefined;
  const what = title ? `“${title}”` : typeof a.path === 'string' && a.path.trim() ? a.path.trim().split('/').filter(Boolean).pop() : 'a paper';
  return {
    category: 'read' as const,
    verb: t.status === 'running' || t.status === 'pending' ? 'Checking' : 'Checked',
    title: `${what} before submitting`,
  };
}
