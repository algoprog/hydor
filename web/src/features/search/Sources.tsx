// The sources a turn used, under its reply: the pages the agent read and the searches it ran, as one
// small line ("Sources · 3 pages read · 2 searches") that opens to the links.
import { useState } from 'react';
import { ChevronRight, Globe, Search } from 'lucide-react';
import type { SessionNote } from '@shared/features';
import { siteOf, type SourcesData } from '@shared/search';
import { useTimeline } from '../../lib/store';
import { cx } from '../../components/ui';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function SourcesNote({ note, sessionKey }: { note: SessionNote; sessionKey: string }) {
  const d = note.data as SourcesData | null;
  const [open, setOpen] = useState(false);
  // A turn further up than the conversation has loaded shows its sources once it loads.
  const here = useTimeline((s) => {
    const tl = s.byKey[sessionKey];
    return !note.anchor || !tl || tl.start === 0 || tl.items.some((i) => i.id === note.anchor);
  });
  if (!here || !d || (!d.pages?.length && !d.searches?.length)) return null;
  const pages = d.pages ?? [];
  const searches = d.searches ?? [];
  const sites = [...new Set((pages.length ? pages.map((p) => p.url) : searches.flatMap((s) => s.top.map((r) => r.url))).map(siteOf))];
  const summary = [pages.length ? `${plural(pages.length, 'page')} read` : '', searches.length ? plural(searches.length, 'search', 'searches') : ''].filter(Boolean).join(' · ');
  return (
    <div className="px-1">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-panel py-1 pr-2 pl-2.5 text-[12.5px] transition-colors hover:bg-bg-2"
      >
        <Globe size={13} className="shrink-0 text-fg-3" />
        <span className="shrink-0 font-medium text-fg-2">Sources</span>
        <span className="min-w-0 truncate text-fg-3">· {summary}</span>
        {sites.slice(0, 3).map((s) => (
          <span key={s} className="hidden max-w-[10rem] shrink-0 truncate rounded-md bg-bg-2 px-1.5 text-[11.5px] text-fg-3 sm:inline">
            {s}
          </span>
        ))}
        {sites.length > 3 && <span className="hidden shrink-0 text-[11.5px] text-fg-3 sm:inline">+{sites.length - 3}</span>}
        <ChevronRight size={13} className={cx('shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="anim-in mt-1.5 divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
          {pages.length > 0 && (
            <div className="px-3 py-2">
              <div className="pb-1 text-[11.5px] font-medium text-fg-3">Pages read</div>
              {pages.map((p) => (
                <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer" className="group/l flex min-w-0 items-baseline gap-2 py-1">
                  <span className="min-w-0 truncate text-[13px] text-fg group-hover/l:text-accent group-hover/l:underline">{p.title || siteOf(p.url)}</span>
                  <span className="shrink-0 text-[11.5px] text-fg-3">{siteOf(p.url)}</span>
                  {p.question && <span className="hidden min-w-0 truncate text-[11.5px] text-fg-3 sm:inline">· “{p.question}”</span>}
                </a>
              ))}
            </div>
          )}
          {searches.length > 0 && (
            <div className="px-3 py-2">
              <div className="pb-1 text-[11.5px] font-medium text-fg-3">Searches</div>
              {searches.map((s, i) => (
                <div key={i} className="py-1">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <Search size={11} className="shrink-0 translate-y-[1px] text-fg-3" />
                    <span className="min-w-0 truncate text-[13px] text-fg-2">{s.query}</span>
                    <span className="shrink-0 text-[11.5px] text-fg-3">
                      <span className="max-sm:hidden">{s.provider} · </span>
                      {plural(s.count, 'result')}
                    </span>
                  </div>
                  {s.top.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1 pl-[19px]">
                      {s.top.map((r) => (
                        <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer" title={r.title} className="max-w-[14rem] truncate rounded-md bg-bg-2 px-1.5 py-px text-[11.5px] text-fg-3 hover:text-accent">
                          {siteOf(r.url)}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
