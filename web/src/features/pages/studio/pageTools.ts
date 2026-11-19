// The page editor's tools on the app's side: where the page is (its project, its title), for its breadcrumbs, the
// project a place to go to (its Files).
import { useMemo } from 'react';
import { useSpaces } from '../../spaces/state';
import { usePagesStore } from '../state';
import { post } from '../../../lib/api';
import { toast, toastError } from '../../../lib/store';

const base64Of = (f: File) =>
  new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => fail(new Error('The file could not be read'));
    r.readAsDataURL(f);
  });

/** Import into the page: a file picked (Markdown, a Notion export, a Word file, a web page, a CSV), its blocks put where Add says. */
export function importInto(cmd: (c: string, arg?: unknown) => void, where: string) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.md,.markdown,.txt,.zip,.docx,.html,.htm,.csv';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      toast(`Bringing in ${f.name}…`);
      const r = await post<{ html: string; notes: string[] }>('/api/pages/import-blocks', { name: f.name, data: await base64Of(f) });
      cmd('importBlocks', { html: r.html, where });
      if (r.notes.length) toast(r.notes.join(' '), 'ok');
    } catch (e) {
      toastError(e);
    }
  };
  input.click();
}

export function useCrumbs(pageId: string | undefined, title: string): { name: string; go?: string }[] {
  const pages = usePagesStore((s) => s.pages);
  const spaces = useSpaces();
  return useMemo(() => {
    const p = pageId ? pages?.find((x) => x.id === pageId) : undefined;
    const out: { name: string; go?: string }[] = [];
    const sp = p?.space ? spaces?.find((s) => s.id === p.space) : undefined;
    if (sp) out.push({ name: sp.name, go: `/projects/${encodeURIComponent(sp.id)}/files` });
    out.push({ name: p?.title ?? title });
    return out;
  }, [pageId, pages, spaces, title]);
}
