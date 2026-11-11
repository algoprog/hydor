// Find and replace in every file of a LaTeX project (beside Files and Outline; a sheet on a narrow screen): the words
// to find (plain text or a regular expression, case that matters or not, whole words), what the hits are as file and
// line with their words (a click opens the file there), and Replace all, which changes every file at once: the checked
// ones only, when some are unchecked. The search reads the files' text as the editors hold it, and runs again as it changes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CaseSensitive, Regex, Replace as ReplaceIcon, WholeWord } from 'lucide-react';
import { SEARCH_LIMITS, searchFiles, type SearchFile, type SearchHit, type SearchOptions } from '@shared/latex-search';
import { Button, cx, IconButton } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';

const OPTS_KEY = 'wa.tex.search';

export function ProjectSearch({
  files,
  version,
  readOnly,
  seed,
  label,
  onGo,
  onReplace,
}: {
  /** The files to search, as their text is now: asked when a search runs. */
  files: () => SearchFile[];
  /** Changes when the files' text does, so the hits are found again. */
  version: unknown;
  readOnly: boolean;
  /** Words to start from (the words picked in the source), and a number that changes to ask for them again. */
  seed?: { text: string; n: number };
  /** A file's name as shown ("main.tex": the document's own name for it). */
  label: (name: string) => string;
  onGo: (hit: SearchHit) => void;
  /** Replace all: the query, what replaces it, the options and the files left unchecked. Returns how many places changed. */
  onReplace: (q: string, by: string, o: SearchOptions, only: Set<string>) => number;
}) {
  const [q, setQ] = useState('');
  const [by, setBy] = useState('');
  const [opts, setOpts] = useState<SearchOptions>(() => {
    try {
      return JSON.parse(localStorage.getItem(OPTS_KEY) ?? '{}') as SearchOptions;
    } catch {
      return {};
    }
  });
  useEffect(() => localStorage.setItem(OPTS_KEY, JSON.stringify(opts)), [opts]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ hits: SearchHit[]; capped: boolean; error?: string }>({ hits: [], capped: false });
  const input = useRef<HTMLInputElement>(null);
  // Words picked in the source start a search, and the field is ready to type in.
  useEffect(() => {
    if (seed?.text) setQ(seed.text.split('\n')[0].slice(0, 200));
    input.current?.focus();
    input.current?.select();
  }, [seed?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => setResult(q ? searchFiles(files(), q, opts) : { hits: [], capped: false }), 220);
    return () => clearTimeout(t);
  }, [q, opts, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const byFile = useMemo(() => {
    const m = new Map<string, SearchHit[]>();
    for (const h of result.hits) m.set(h.file, [...(m.get(h.file) ?? []), h]);
    return [...m.entries()];
  }, [result]);
  const checked = byFile.filter(([f]) => !off.has(f));
  const places = checked.reduce((n, [, l]) => n + l.length, 0);
  const toggle = (k: keyof SearchOptions) => setOpts((o) => ({ ...o, [k]: !o[k] }));
  const opt = (k: keyof SearchOptions, title: string, icon: React.ReactNode) => (
    <IconButton label={title} size="sm" active={!!opts[k]} onClick={() => toggle(k)} className="h-7 w-7">
      {icon}
    </IconButton>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-1.5 border-b border-line p-2">
        <div className="flex items-center gap-1">
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find in all files"
            aria-label="Find in all files"
            spellCheck={false}
            className="h-8 min-w-0 flex-1 rounded-lg border border-line-2 bg-bg-1 px-2.5 text-[13px] outline-none placeholder:text-fg-3 focus:border-accent/60"
          />
          {opt('caseSensitive', 'Match case', <CaseSensitive size={15} />)}
          {opt('wholeWord', 'Whole words', <WholeWord size={15} />)}
          {opt('regex', 'Regular expression', <Regex size={15} />)}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1">
            <input
              value={by}
              onChange={(e) => setBy(e.target.value)}
              placeholder={opts.regex ? 'Replace with ($1 for a group)' : 'Replace with'}
              aria-label="Replace with"
              spellCheck={false}
              className="h-8 min-w-0 flex-1 rounded-lg border border-line-2 bg-bg-1 px-2.5 text-[13px] outline-none placeholder:text-fg-3 focus:border-accent/60"
            />
            <Button
              size="sm"
              variant="secondary"
              icon={<ReplaceIcon size={13} />}
              disabled={!places}
              onClick={() => {
                const n = onReplace(q, by, opts, new Set(checked.map(([f]) => f)));
                if (n) setResult({ hits: [], capped: false });
              }}
            >
              Replace all
            </Button>
          </div>
        )}
        <div className="px-0.5 text-[11.5px] text-fg-3">
          {result.error ? (
            <span className="text-err" translate="no">
              {result.error}
            </span>
          ) : !q ? (
            tr('Words, or a regular expression, in every file of the document.')
          ) : !result.hits.length ? (
            tr('No match.')
          ) : (
            `${places} ${tr(places === 1 ? 'place' : 'places')} · ${checked.length} ${tr(checked.length === 1 ? 'file' : 'files')}${result.capped ? ` · ${tr('showing the first')} ${Math.min(result.hits.length, SEARCH_LIMITS.hits)}` : ''}`
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
        {byFile.map(([file, hits]) => (
          <div key={file} className="mb-1">
            <div className="flex items-center gap-1.5 px-2 py-1">
              {!readOnly && (
                <input
                  type="checkbox"
                  checked={!off.has(file)}
                  onChange={() => setOff((s) => (s.has(file) ? new Set([...s].filter((x) => x !== file)) : new Set(s).add(file)))}
                  aria-label={`Replace in ${label(file)}`}
                  className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                />
              )}
              <span translate="no" className="min-w-0 flex-1 truncate text-[12px] font-medium text-fg-2" title={file}>
                {label(file)}
              </span>
              <span className="shrink-0 text-[11px] text-fg-3 tabular-nums">{hits.length}</span>
            </div>
            {hits.map((h) => (
              <button
                key={`${h.file}:${h.from}`}
                type="button"
                onClick={() => onGo(h)}
                className={cx('flex w-full items-baseline gap-2 px-2 py-0.5 text-left hover:bg-bg-2', off.has(file) && 'opacity-45')}
              >
                <span className="w-8 shrink-0 text-right font-mono text-[11px] text-fg-3 tabular-nums">{h.line}</span>
                <span translate="no" className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg-2">
                  {h.at > 40 ? `…${h.text.slice(h.at - 30, h.at)}` : h.text.slice(0, h.at)}
                  <mark className="rounded-sm bg-accent/25 text-fg">{h.text.slice(h.at, h.at + h.len)}</mark>
                  {h.text.slice(h.at + h.len)}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
