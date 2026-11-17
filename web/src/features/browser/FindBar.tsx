// Find in page: a slim row under the address bar (the page itself may be a native view, which nothing can sit over).
// In the desktop app the page's own find runs ("3 of 12"); anywhere else the server's.
import { useEffect, useRef, useState } from 'react';
import { CaseSensitive, ChevronDown, ChevronUp, X } from 'lucide-react';
import { enc, post } from '../../lib/api';
import { toastError } from '../../lib/store';
import { cx, IconButton, inputCls } from '../../components/ui';
import { desktopBrowser, KEY } from './browsing';

const serverFind = (text: string, back = false) => post<{ found: boolean; count: number }>(`/api/browser/sessions/${enc(KEY)}/find`, { text, back });

/** What a search found: how many matches, and which one is shown (0 when the page does not say). */
type Result = { count: number; at: number };

export function FindBar({ onClose, focusTick, tab, native }: { onClose: () => void; focusTick: number; tab?: string; native: boolean }) {
  const [text, setText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const last = useRef({ text: '', matchCase: false, tab: '' });
  // The tab searched is the one shown when it started; one that changed under the bar is searched anew.
  const bridge = native && tab ? desktopBrowser() : undefined;
  // Ctrl or ⌘ + F again while it is open selects what is in it.
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusTick]);
  // Stops the search, clearing the page's selection, when the bar goes (or the tab it searched does).
  const stop = (t: string) => {
    if (!t) return;
    if (bridge) void bridge.find(t, '').catch(() => {});
    else void serverFind('').catch(() => {});
  };
  useEffect(
    () => () => {
      stop(last.current.tab || tab || '');
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const run = async (back = false, t = text, again = false) => {
    const prev = last.current;
    if (!t) {
      last.current = { text: '', matchCase, tab: tab ?? '' };
      setResult(null);
      return stop(prev.tab || tab || '');
    }
    try {
      if (bridge && tab) {
        if (prev.tab && prev.tab !== tab) stop(prev.tab);
        // The same words again, in the same tab, go on to the next match; anything else is a new search.
        const next = again && prev.text === t && prev.matchCase === matchCase && prev.tab === tab;
        last.current = { text: t, matchCase, tab };
        const r = await bridge.find(tab, t, { forward: !back, findNext: next, matchCase });
        if (r) return setResult({ count: r.matches, at: r.active });
        // Not one of the app's own tabs: the server's find.
      }
      last.current = { text: t, matchCase, tab: tab ?? '' };
      const r = await serverFind(t, back);
      setResult({ count: r.found ? r.count : 0, at: 0 });
    } catch (e) {
      toastError(e);
    }
  };
  // Searches as you type, after a short pause (and again when the tab or the case setting changes).
  useEffect(() => {
    const l = last.current;
    if (text === l.text && matchCase === l.matchCase && (tab ?? '') === l.tab) return;
    const t = window.setTimeout(() => void run(false, text), 250);
    return () => window.clearTimeout(t);
  }, [text, matchCase, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-10 shrink-0 items-center justify-end gap-1.5 border-b border-line bg-bg-1 px-3">
      <input
        ref={input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') return onClose();
          if (e.key === 'Enter') {
            e.preventDefault();
            void run(e.shiftKey, text, true);
          }
        }}
        placeholder="Find in page"
        aria-label="Find in page"
        className={cx(inputCls, 'h-7.5 max-w-[260px] text-[13px]')}
      />
      <span className={cx('tnum min-w-[76px] text-[12.5px]', result && !result.count ? 'text-warn' : 'text-fg-3')}>
        {result ? (result.count ? (result.at ? `${result.at} of ${result.count >= 1000 ? '1000+' : result.count}` : `${result.count >= 1000 ? '1000+' : result.count} match${result.count === 1 ? '' : 'es'}`) : 'No matches') : ''}
      </span>
      {bridge && (
        <IconButton label="Match case" size="sm" active={matchCase} onClick={() => setMatchCase((m) => !m)}>
          <CaseSensitive size={16} />
        </IconButton>
      )}
      <IconButton label="Previous match" size="sm" disabled={!text} onClick={() => void run(true, text, true)}>
        <ChevronUp size={15} />
      </IconButton>
      <IconButton label="Next match" size="sm" disabled={!text} onClick={() => void run(false, text, true)}>
        <ChevronDown size={15} />
      </IconButton>
      <IconButton label="Close" size="sm" onClick={onClose}>
        <X size={15} />
      </IconButton>
    </div>
  );
}
