// The app's side of the page editor's AI and of what a database asks beyond its keeper: a request of the AI on the page
// (server/pages/writing-ai.ts) goes to the helper model (POST /api/write/page-ai) and its answer back to the page; an AI
// column's cell is filled the same way (POST /api/write/db-ai); a file for a database's Files & pictures cell is kept for
// pages (POST /api/pages/files) and its address goes back.
import { useRef } from 'react';
import type { DbAiAnswer, PageAiAnswer } from '@shared/page-ai';
import { api } from '../../../lib/api';
import { mu } from '../../../lib/machine';

const why = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 400);

/** Keeps a file for a page (a File, Sound or PDF block, a database's cell): its address, name, kind and size. */
export async function keepPageFile(file: File): Promise<{ src: string; name: string; type: string; size: number }> {
  const r = await fetch(mu(`/api/pages/files?name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.type)}`), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `The file could not be kept (${r.status})`);
  return j;
}

export function usePageAi(cmd: (c: string, arg?: unknown) => void, pageId?: string) {
  const runs = useRef(new Map<string, AbortController>());
  const cb = useRef({ cmd, pageId });
  cb.current = { cmd, pageId };
  return {
    onAi: (id: string, ask: Record<string, unknown>) => {
      const ac = new AbortController();
      runs.current.set(id, ac);
      api<PageAiAnswer>('/api/write/page-ai', { method: 'POST', body: { ...ask, pageId: cb.current.pageId }, signal: ac.signal })
        .then(
          (r) => cb.current.cmd('aiAnswer', { id, markdown: r.markdown, model: r.model, cost: r.cost }),
          (e) => !ac.signal.aborted && cb.current.cmd('aiAnswer', { id, error: why(e) }),
        )
        .finally(() => runs.current.delete(id));
    },
    onAiStop: (id: string) => {
      runs.current.get(id)?.abort();
      runs.current.delete(id);
    },
    onDbAi: (id: number, ask: Record<string, unknown>) =>
      void api<DbAiAnswer>('/api/write/db-ai', { method: 'POST', body: { ...ask, pageId: cb.current.pageId } }).then(
        (r) => cb.current.cmd('answer', { id, value: r }),
        (e) => cb.current.cmd('answer', { id, error: why(e) }),
      ),
    onUpload: (id: number, file: File) =>
      void keepPageFile(file).then(
        (r) => cb.current.cmd('answer', { id, value: r }),
        (e) => cb.current.cmd('answer', { id, error: why(e) }),
      ),
  };
}
