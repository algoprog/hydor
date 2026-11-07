// Answer UIs (components/answer): the gallery of every UI agents show answers in, at /answers, loaded the first time it
// opens. The UIs themselves draw inside replies (Markdown.tsx); find_ui is a step among an agent's work that reads
// "Finding a UI · compare laptops by price".
import { lazy, Suspense } from 'react';
import type { ToolInfo } from '@shared/types';
import { StepRow } from '../automations/StepRow';
import type { ToolView, WebFeature } from '../registry';

const AnswersPage = lazy(() => import('./AnswersPage'));

function Page() {
  return (
    <Suspense fallback={null}>
      <AnswersPage />
    </Suspense>
  );
}

/** What find_ui looked for: its words, or the UIs it asked for by name. */
function asked(t: ToolInfo): string | undefined {
  const i = (t.input ?? {}) as { query?: unknown; names?: unknown };
  if (typeof i.query === 'string' && i.query.trim()) return i.query.trim();
  return Array.isArray(i.names) ? i.names.map(String).join(', ') : undefined;
}

const FIND_UI_VIEW: ToolView = {
  place: 'work',
  Row: StepRow,
  step: (t) => ({ category: 'search', verb: t.status === 'running' || t.status === 'pending' ? 'Finding a UI' : 'Found UIs', title: asked(t) }),
};

export const answersFeature: WebFeature = {
  id: 'answers',
  toolViews: { find_ui: FIND_UI_VIEW },
  routes: [{ match: (p) => p === '/answers', Page }],
};
