// A read-only view of the project's existing wiki, using Hydor's Markdown renderer and the scoped wiki API.
import { useEffect, useState, type MouseEvent } from 'react';
import { BookOpen, FileText } from 'lucide-react';
import { Markdown } from '../../components/Markdown';
import { Button, Throbber } from '../../components/ui';
import { api, enc } from '../../lib/api';
import { wikiDocument, wikiRelative } from './SpaceWikiPaths';

type WikiItem = { path: string; title: string };
type WikiIndex = { status: 'ready' | 'disabled' | 'missing' | 'error'; root?: string; articles?: WikiItem[]; sources?: WikiItem[]; error?: string; truncated?: boolean };
type WikiFile = { path: string; content: string; sha256: string };

export function SpaceWiki({ id }: { id: string }) {
  const [index, setIndex] = useState<WikiIndex | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<WikiFile | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setIndex(null); setSelected(null); setFile(null); setError('');
    api<WikiIndex>(`/api/projects/${enc(id)}/wiki`).then((r) => { if (active) setIndex(r); }, (e) => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [id]);
  useEffect(() => {
    if (!selected) { setFile(null); return; }
    let active = true;
    setFile(null); setError(''); setLoading(true);
    api<WikiFile>(`/api/projects/${enc(id)}/wiki/file?path=${enc(selected)}`).then((r) => { if (active) setFile(r); }, (e) => { if (active) setError((e as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, selected]);
  const openLink = (e: MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as Element).closest('a');
    if (!anchor || !file || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const href = anchor.getAttribute('href') ?? '';
    const target = wikiRelative(file.path, href);
    if (target) { e.preventDefault(); setSelected(target); }
    // Do not let invalid relative links escape the wiki through normal browser navigation.
    else if (href && !/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href)) e.preventDefault();
  };
  const doc = file ? wikiDocument(file.content) : null;
  const list = (items: WikiItem[], label: 'articles' | 'sources') => items.length ? (
    <section><h3 className="mb-2 text-[12px] font-semibold text-fg-3">{label === 'articles' ? 'Articles' : 'Sources'}</h3>
      <div className="space-y-1">{items.map((item) => <button key={item.path} type="button" onClick={() => setSelected(item.path)} className={`flex w-full min-w-0 items-start gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-bg-2 ${selected === item.path ? 'bg-bg-2 font-semibold' : ''}`}><FileText size={15} className="mt-0.5 shrink-0" /><span className="min-w-0 break-words" title={item.path}>{item.title || item.path}</span></button>)}</div>
    </section>
  ) : null;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3"><BookOpen size={20} className="mt-1 shrink-0 text-fg-2" /><div><h2 className="text-[16px] font-semibold">LLM Wiki</h2><p className="text-[13px] text-fg-3">The articles and sources in this project's wiki.</p><a href="/guide/llm-wiki" className="text-[12px] text-accent hover:underline">Learn more</a></div></div>
      {error && <div role="alert" className="rounded-xl border border-line bg-panel p-4 text-[13px]">{error}</div>}
      {!index && !error && <Throbber />}
      {index?.status === 'disabled' && <p className="text-[13px] text-fg-3">LLM Wiki is off. Turn it on in Settings → Memory → LLM Wiki.</p>}
      {index?.status === 'missing' && <p className="text-[13px] text-fg-3">This project does not have a wiki at its configured location.</p>}
      {index?.status === 'error' && <p role="alert" className="text-[13px] text-fg-3">{index.error || 'The project wiki could not be opened.'}</p>}
      {index?.status === 'ready' && <p className="text-[13px] text-fg-3">Ready</p>}
      {index?.root && <p className="break-all text-[12px] text-fg-3"><span>Wiki folder</span>: <span translate="no">{index.root}</span></p>}
      {index?.status === 'ready' && <>
        {index.truncated && <p className="text-[12px] text-fg-3">The list is limited; some files are not shown.</p>}
        <div className="grid gap-4 md:grid-cols-[minmax(180px,260px)_minmax(0,1fr)]">
          <aside className="max-h-72 space-y-4 overflow-auto rounded-xl border border-line bg-panel p-3 md:max-h-[70vh]">{list(index.articles ?? [], 'articles')}{list(index.sources ?? [], 'sources')}{!index.articles?.length && !index.sources?.length && <p className="text-[13px] text-fg-3">No articles or sources yet.</p>}</aside>
          <section className="min-w-0 rounded-xl border border-line bg-panel p-4 sm:p-6">
            {loading && <Throbber />}
            {!selected && <p className="text-[13px] text-fg-3">Select an article or source to read it.</p>}
            {file && doc && <><div className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-fg-3"><span className="min-w-0 flex-1 break-all" translate="no">{file.path}</span><Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Close</Button></div><div onClick={openLink}><Markdown text={doc.body} className="break-words text-[14px]" /></div>{doc.sources.length > 0 && <section className="mt-6 border-t border-line pt-4"><h3 className="mb-2 text-[13px] font-semibold">Sources</h3><div className="space-y-1">{doc.sources.map((source) => { const target = wikiRelative('index.md', source); return target ? <button key={source} type="button" className="block break-all text-left text-[13px] text-accent hover:underline" onClick={() => setSelected(target)}>{source}</button> : /^https?:\/\//i.test(source) ? <a key={source} href={source} target="_blank" rel="noopener noreferrer" className="block break-all text-[13px] text-accent hover:underline">{source}</a> : <span key={source} className="block break-all text-[13px] text-fg-3">{source}</span>; })}</div></section>}</>}
          </section>
        </div>
      </>}
    </div>
  );
}
