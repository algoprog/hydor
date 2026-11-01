// How web_search and read_page show in a conversation: one line among the agent's steps (what it
// looked for, which provider answered, how many results), opening to the results (title, site, date,
// category, snippet) or to the page's text. Both read back the text the tool answered with
// (shared/search.ts), so they work for every agent and for sessions long finished.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BookOpen, ChevronRight, ExternalLink, Globe, Info, XCircle } from 'lucide-react';
import type { TimelineItem, ToolItem } from '@shared/types';
import { parsePage, parseSearch, siteOf, type ParsedSearch } from '@shared/search';
import { api, enc } from '../../lib/api';
import { duration } from '../../lib/format';
import { Markdown } from '../../components/Markdown';
import { Badge, cx } from '../../components/ui';
import { LOCALE } from '../../i18n/locale';

/** The tool's whole answer: a conversation keeps only the start and end of a long one at first. */
function useFullOutput(item: ToolItem, sessionKey: string, open: boolean): string | undefined {
  const t = item.tool;
  const [full, setFull] = useState<string>();
  useEffect(() => {
    if (!open || !t.truncated || full !== undefined || t.status === 'running') return;
    let alive = true;
    api<TimelineItem>(`/api/sessions/${enc(sessionKey)}/items/${enc(item.id)}`).then(
      (it) => alive && it.kind === 'tool' && setFull(it.tool.output ?? ''),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [open, t.truncated, t.status, item.id, sessionKey, full]);
  return full ?? t.output;
}

function Since({ ts }: { ts?: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return ts ? <span className="tnum">{duration(Date.now() - ts)}</span> : null;
}

/** A step's line, as the other steps look: icon, what it did, details; a click opens it. */
function StepButton({ icon, verb, what, aside, item, open, onClick }: { icon: ReactNode; verb: string; what: ReactNode; aside?: ReactNode; item: ToolItem; open: boolean; onClick: () => void }) {
  const t = item.tool;
  const running = t.status === 'running' || t.status === 'pending';
  return (
    <button onClick={onClick} className={cx('group flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-bg-2', open && 'bg-bg-2')}>
      {icon}
      <span className="flex min-w-0 flex-1 items-baseline gap-2 text-[13px]">
        <span className={cx('shrink-0', running ? 'text-fg' : 'text-fg-3')}>{verb}</span>
        <span className={cx('min-w-0 truncate', running ? 'shine' : 'text-fg-2')}>{what}</span>
      </span>
      {aside}
      {running ? (
        <span className="shrink-0 text-[11px] text-fg-3">
          <Since ts={item.ts} />
        </span>
      ) : (
        t.durationMs != null && t.durationMs >= 1500 && <span className="tnum shrink-0 text-[11px] text-fg-3 max-sm:hidden">{duration(t.durationMs)}</span>
      )}
      {running && <span className="mx-1 h-1.5 w-1.5 shrink-0 rounded-full bg-busy" aria-label="Running" />}
      {t.status === 'error' && <XCircle size={14} className="shrink-0 text-err" />}
      <ChevronRight size={14} className={cx('shrink-0 text-fg-3 opacity-0 transition group-hover:opacity-100', open && 'rotate-90 opacity-100')} />
    </button>
  );
}

const LABEL: Record<string, string> = {
  academic: 'Paper',
  arxiv: 'arXiv',
  pubmed: 'PubMed',
  europepmc: 'Europe PMC',
  'semantic-scholar': 'Semantic Scholar',
  openalex: 'OpenAlex',
  dblp: 'DBLP',
  'acl-anthology': 'ACL Anthology',
  uspto: 'Patent',
  'sec-filings': 'SEC filing',
  howto: 'How-to',
  docs: 'Docs',
  stackexchange: 'Stack Exchange',
  'social media': 'Social',
};
const SCHOLARLY = new Set(['academic', 'arxiv', 'pubmed', 'europepmc', 'semantic-scholar', 'openalex', 'dblp', 'acl-anthology', 's2orc', 'scholar-metadata', 'science', 'uspto']);
const categoryLabel = (id: string) => LABEL[id] ?? id.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** "May 2, 2024" (or "May 2024", "2024") from what the result says. */
function day(d: string): string {
  const t = Date.parse(d.length === 4 ? `${d}-01-01` : d.length === 7 ? `${d}-01` : d);
  if (!Number.isFinite(t)) return d;
  if (d.length === 4) return d;
  return new Date(t).toLocaleDateString(LOCALE, { year: 'numeric', month: 'short', day: d.length === 10 ? 'numeric' : undefined, timeZone: 'UTC' });
}

function Results({ p, more }: { p: ParsedSearch; more: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? p.hits : p.hits.slice(0, 8);
  return (
    <>
      <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
        {shown.map((h) => (
          <li key={h.n} className="flex gap-2.5 px-3 py-2.5">
            <span className="tnum mt-[3px] w-4 shrink-0 text-right text-[11px] text-fg-3">{h.n}</span>
            <div className="min-w-0 flex-1">
              <a href={h.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-[13.5px] leading-snug font-medium text-fg hover:text-accent hover:underline">
                {h.title}
              </a>
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-fg-3">
                <span className="min-w-0 truncate">{siteOf(h.url)}</span>
                {h.date && <span className="shrink-0">· {day(h.date)}</span>}
                {h.category && <Badge tone={SCHOLARLY.has(h.category) ? 'info' : 'neutral'}>{categoryLabel(h.category)}</Badge>}
                {h.fileType === 'pdf' && <Badge>PDF</Badge>}
              </div>
              {h.filtered ? (
                <div className="mt-1 line-clamp-6 border-l-2 border-accent/40 pl-2 text-[12.5px] leading-relaxed whitespace-pre-line text-fg-2">{h.filtered}</div>
              ) : (
                h.snippet && <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-fg-2">{h.snippet}</p>
              )}
            </div>
            <a href={h.url} target="_blank" rel="noopener noreferrer" aria-label="Open" title="Open" className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-3 hover:bg-bg-2 hover:text-fg">
              <ExternalLink size={13} />
            </a>
          </li>
        ))}
      </ol>
      {(p.hits.length > shown.length || more) && (
        <button onClick={() => setAll(true)} disabled={all} className="mt-1.5 text-[12px] text-fg-3 hover:text-fg disabled:opacity-60">
          {all ? 'Loading the rest…' : `Show all ${p.count} results`}
        </button>
      )}
    </>
  );
}

/** web_search: the query, the provider and how many results; open, the results themselves. */
export function SearchRow({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  const [open, setOpen] = useState(false);
  const output = useFullOutput(item, sessionKey, open);
  const p = useMemo(() => parseSearch(output), [output]);
  const input = (t.input ?? {}) as { query?: string; q?: string };
  const running = t.status === 'running' || t.status === 'pending';
  const failed = t.status === 'error' || (!running && !p && !!output);
  const query = p?.query ?? input.query ?? input.q ?? '';
  return (
    <div className="tl-item">
      <StepButton
        item={item}
        open={open}
        onClick={() => setOpen((o) => !o)}
        icon={<Globe size={14} className={cx('shrink-0', failed ? 'text-err' : running ? 'text-busy' : 'text-fg-3')} />}
        verb={running ? 'Searching the web' : failed ? 'Web search failed' : 'Searched the web'}
        what={query ? `“${query}”` : ''}
        aside={
          p && (
            <span className="shrink-0 text-[11.5px] text-fg-3">
              <span className="max-sm:hidden">{p.provider} · </span>
              {p.count} result{p.count === 1 ? '' : 's'}
            </span>
          )
        }
      />
      {open && (
        <div className="space-y-2 pt-1.5 pb-2 pl-7">
          {p?.filters && (
            <div className="flex flex-wrap gap-1">
              {p.filters.split('; ').map((f) => (
                <span key={f} className="rounded-md bg-bg-2 px-1.5 py-px text-[11.5px] text-fg-2 ring-1 ring-line">
                  {f}
                </span>
              ))}
              {p.filtered && <span className="rounded-md bg-accent-soft px-1.5 py-px text-[11.5px] text-accent">the parts that answer it</span>}
            </div>
          )}
          {p?.notes.map((n) => (
            <div key={n} className="flex items-start gap-1.5 text-[12px] leading-snug text-fg-3">
              <Info size={12} className="mt-[2px] shrink-0" />
              <span>{n}</span>
            </div>
          ))}
          {p && p.hits.length > 0 && <Results p={p} more={!!t.truncated && output === t.output} />}
          {p && !p.hits.length && <div className="text-[12.5px] text-fg-3">Nothing matched.</div>}
          {!p && output && <div className={cx('rounded-lg border border-line px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap', failed ? 'text-err' : 'text-fg-2')}>{output}</div>}
          {!p && !output && running && <div className="text-[12.5px] text-fg-3">Searching…</div>}
        </div>
      )}
    </div>
  );
}

/** read_page: the page (and the question asked of it); open, what came back. */
export function ReadRow({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  const [open, setOpen] = useState(false);
  const output = useFullOutput(item, sessionKey, open);
  const p = useMemo(() => parsePage(output), [output]);
  const input = (t.input ?? {}) as { url?: string; question?: string; page?: number };
  const running = t.status === 'running' || t.status === 'pending';
  const failed = t.status === 'error';
  const url = p?.url ?? input.url ?? '';
  const site = url ? siteOf(url) : '';
  const title = p?.title && p.title !== site ? p.title : site || 'a page';
  const detail = input.question ? `for “${input.question}”` : p?.detail;
  return (
    <div className="tl-item">
      <StepButton
        item={item}
        open={open}
        onClick={() => setOpen((o) => !o)}
        icon={<BookOpen size={14} className={cx('shrink-0', failed ? 'text-err' : running ? 'text-busy' : 'text-fg-3')} />}
        verb={running ? 'Reading' : failed ? 'Could not read' : 'Read'}
        what={title}
        aside={detail && <span className="min-w-0 max-w-[45%] shrink truncate text-[11.5px] text-fg-3 max-sm:hidden">{detail}</span>}
      />
      {open && (
        <div className="space-y-2 pt-1.5 pb-2 pl-7">
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1 text-[12px] text-accent hover:underline">
              <span className="truncate">{url}</span>
              <ExternalLink size={11} className="shrink-0" />
            </a>
          )}
          {p?.detail && <div className="text-[12px] text-fg-3">{p.detail}</div>}
          {p ? (
            <div className="max-h-[360px] overflow-auto rounded-lg border border-line px-3 py-2">
              {input.question ? <Markdown text={p.body} className="!text-[13px]" /> : <div className="text-[12.5px] leading-relaxed whitespace-pre-wrap text-fg-2">{p.body}</div>}
            </div>
          ) : (
            output && <div className={cx('rounded-lg border border-line px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap', failed ? 'text-err' : 'text-fg-2')}>{output}</div>
          )}
          {!output && running && <div className="text-[12.5px] text-fg-3">Reading…</div>}
        </div>
      )}
    </div>
  );
}
