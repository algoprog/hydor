// The page editor's tools on the app's side: where the page is in the Library (its project, its folders, its title), for
// its breadcrumbs, each a place of the Library to go to.
import { useMemo } from 'react';
import { useSpaces } from '../../spaces/state';
import { folderChain } from '../folders';
import { usePagesStore } from '../state';
import { tr } from '../../../i18n/runtime';

export function useCrumbs(pageId: string | undefined, title: string): { name: string; go?: string }[] {
  const pages = usePagesStore((s) => s.pages);
  const folders = usePagesStore((s) => s.folders);
  const spaces = useSpaces();
  return useMemo(() => {
    const p = pageId ? pages?.find((x) => x.id === pageId) : undefined;
    const out: { name: string; go?: string }[] = [{ name: tr('Library'), go: '/library' }];
    const sp = p?.space ? spaces?.find((s) => s.id === p.space) : undefined;
    if (sp) out.push({ name: sp.name, go: `/library?project=${encodeURIComponent(sp.id)}` });
    for (const f of folderChain(folders, p?.folder ?? null)) out.push({ name: f.name, go: `/library?folder=${encodeURIComponent(f.id)}` });
    out.push({ name: p?.title ?? title });
    return out;
  }, [pageId, pages, folders, spaces, title]);
}
