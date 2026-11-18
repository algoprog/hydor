// The box in the bar: search, open, ask, or tell an agent what to do. What you type is completed in place, and a list
// under it offers your open tabs, bookmarks and history, what you typed as an address, the search engine's suggestions
// and, last, asking about the page you are on, doing something in it (an agent in a tab of its own) and asking an agent.
// Enter opens the one marked (or what you typed), Tab or → takes the completion, Shift+Delete forgets a page of your
// history. At rest it shows the address as its site and the rest. What you typed stays while the window is behind another;
// a click into the page ends it, as in any browser. A padlock opens what the page's site may do; a chip
// shows a zoom other than 100 %; a star bookmarks the page.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Globe, Info, Lock, LockOpen, PanelTop, Search, Sparkles, Star, WandSparkles } from 'lucide-react';
import type { BrowserTab, Suggestion } from '@shared/browser';
import { MOD } from '../../lib/format';
import { cx, Kbd } from '../../components/ui';
import { askAgent, desktopBrowser, ENGINE_NAMES, forgetAddress, goTo, shownAddress, suggest, switchTab, useTabState, usePrefs, zoomPercent } from './browsing';
import { fitRows } from './omniboxFit';
import { PrivateChip } from './Private';
import { ReaderButtons } from './Reader';
import { connectionOf, SiteInfo } from './SiteInfo';
import { TranslateButton } from './Translate';

/** One row of the list. */
interface Row {
  id: string;
  kind: Suggestion['kind'] | 'ask' | 'askpage' | 'do';
  /** Its main words, and the address under them. */
  title: string;
  url?: string;
  /** For a tab: which one. For a search or asking: the words. */
  tab?: string;
  text?: string;
  /** Found by what it is about, not by the words typed: nothing in it is marked. */
  meaning?: boolean;
}

const ROW = 34;
const stripScheme = (x: string) => x.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^www\./i, '');
const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Text with the typed words in bold. */
function Marked({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.map(escapeRe).join('|')})`, 'ig'));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <b key={i} className="font-semibold text-fg">
            {p}
          </b>
        ) : (
          p
        ),
      )}
    </>
  );
}

const ICONS: Record<Row['kind'], typeof Globe> = { tab: PanelTop, bookmark: Star, history: Clock, url: Globe, search: Search, ask: Sparkles, askpage: Sparkles, do: WandSparkles };

/** An address as its site and the rest of it (what the box shows at rest); an address that is not a web one is all one. */
function splitAddress(url: string): { site: string; rest: string } {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { site: shownAddress(url), rest: '' };
    const rest = `${u.pathname === '/' ? '' : u.pathname}${u.search}${u.hash}`;
    return { site: u.host.replace(/^www\./, ''), rest };
  } catch {
    return { site: shownAddress(url), rest: '' };
  }
}

export function Omnibox({
  inputRef,
  tab,
  starred,
  canStar,
  onStar,
  compact,
  onAskPage,
  onDoHere,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  tab?: BrowserTab;
  starred: boolean;
  canStar: boolean;
  onStar: () => void;
  compact?: boolean;
  /** Ask about the page the tab is on (given for a web page): what was typed is the question. */
  onAskPage?: (question: string) => void;
  /** Have an agent do what was typed in a tab of its own (given for a web page). */
  onDoHere?: (what: string) => void;
}) {
  const url = tab?.url ?? '';
  const [typed, setTyped] = useState('');
  const [completion, setCompletion] = useState('');
  const [editing, setEditing] = useState(false);
  // You changed the text (not only clicked into the bar): the list has something to offer.
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ q: string; items: Suggestion[]; inline?: string } | null>(null);
  // The row the keys marked (-1: none), and the one the mouse is over (it only lights up; the text stays what you typed).
  const [sel, setSel] = useState(-1);
  const [hover, setHover] = useState(-1);
  const [info, setInfo] = useState(false);
  const noInline = useRef(false);
  // The window went behind another while you were in the box: it is still the page's focused element and keeps what you
  // typed, and goes on from there when the window comes back (the focus it gets then is not a new start).
  const held = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const lock = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ left: number; top: number; width: number; room: number } | null>(null);
  const prefs = usePrefs((s) => s.prefs);
  const zoom = useTabState((s) => (tab ? s.byTab[tab.id]?.zoom : undefined));
  const percent = zoom ? zoomPercent(zoom) : 100;
  const q = typed.trim();

  // The list, for what is typed: what you typed first (as a search, unless it is an address), then what was found.
  const rows = useMemo<Row[]>(() => {
    if (!q) return [];
    const found = result?.q === q ? result.items : [];
    const out: Row[] = [];
    const lower = q.toLowerCase();
    if (!found.some((i) => i.kind === 'url') && !found.some((i) => i.kind === 'search' && i.text.toLowerCase() === lower)) out.push({ id: 'typed', kind: 'search', title: q, text: q });
    found.forEach((i, n) => {
      if (i.kind === 'search') out.push({ id: `s${n}`, kind: 'search', title: i.text, text: i.text });
      else if (i.kind === 'tab') out.push({ id: `t${i.tab}`, kind: 'tab', title: i.title || i.url, url: i.url, tab: i.tab });
      else out.push({ id: `${i.kind[0]}${n}`, kind: i.kind, title: i.title || i.url, url: i.url, ...('meaning' in i && i.meaning ? { meaning: true } : {}) });
    });
    // As many as fit on the screen without scrolling, some of your pages and some of the engine's among them; asking an agent stays last.
    const fit = Math.max(2, Math.floor(((at?.room ?? 440) - 12) / ROW));
    const tail: Row[] = [];
    if (onAskPage) tail.push({ id: 'askpage', kind: 'askpage', title: q, text: q });
    if (onDoHere) tail.push({ id: 'do', kind: 'do', title: q, text: q });
    tail.push({ id: 'ask', kind: 'ask', title: q, text: q });
    return [...fitRows(out, Math.max(1, fit - tail.length)), ...tail];
  }, [q, result, at?.room, !!onAskPage, !!onDoHere]); // eslint-disable-line react-hooks/exhaustive-deps
  const words = useMemo(() => q.split(/\s+/).filter((w) => w.length > 0), [q]);
  const fill = (r: Row) => (r.kind === 'ask' || r.kind === 'askpage' || r.kind === 'do' || r.kind === 'search' ? (r.text ?? '') : shownAddress(r.url));
  const row = sel >= 0 ? rows[sel] : undefined;
  const value = !editing ? shownAddress(url) : row ? fill(row) : typed + completion;

  // Asks for suggestions a moment after typing stops; an answer to words no longer typed is dropped.
  useEffect(() => {
    if (!dirty || !q) return setResult(null);
    const ctl = new AbortController();
    const t = window.setTimeout(() => {
      suggest(q, ctl.signal).then(
        (r) => {
          if (ctl.signal.aborted) return;
          setResult({ q, items: r.items, inline: r.inline });
          // Completes in place when the caret is at the end and you are not deleting.
          const el = inputRef.current;
          if (noInline.current || !r.inline || !el || document.activeElement !== el || el.selectionStart !== typed.length || el.selectionEnd !== typed.length) return;
          const a = stripScheme(typed);
          const b = stripScheme(r.inline);
          if (a && b.length > a.length && b.toLowerCase().startsWith(a.toLowerCase())) setCompletion(b.slice(a.length));
        },
        () => {},
      );
    }, 80);
    return () => {
      window.clearTimeout(t);
      ctl.abort();
    };
  }, [typed, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // The completed part shows selected after the caret.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (completion && el && document.activeElement === el && sel < 0) el.setSelectionRange(typed.length, typed.length + completion.length);
  }, [completion, typed, sel, inputRef]);

  // Where the list goes: under the bar, as wide, with the room below it.
  useLayoutEffect(() => {
    if (!open) return setAt(null);
    const place = () => {
      const r = box.current?.getBoundingClientRect();
      if (r) setAt({ left: r.left, top: r.bottom + 4, width: r.width, room: window.innerHeight - r.bottom - 16 });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  const close = () => {
    setOpen(false);
    setSel(-1);
    setHover(-1);
  };
  const finish = () => {
    close();
    held.current = false;
    setEditing(false);
    setDirty(false);
    setCompletion('');
    inputRef.current?.blur();
  };
  // In the desktop app, your tab's page took the keys (you clicked into it): the box lets go, as in any browser. This page
  // hears it from the app, since to it that looks the same as the window going behind another.
  useEffect(() => desktopBrowser()?.onPageFocus?.(() => document.activeElement === inputRef.current && finish()), []); // eslint-disable-line react-hooks/exhaustive-deps
  // The page takes the keyboard after an address is opened, as in any browser.
  const toPage = (id?: string) => id && void desktopBrowser()?.focus(id);
  const choose = (r: Row | undefined, inNew: boolean) => {
    const text = (typed + completion).trim();
    finish();
    if (r?.kind === 'tab' && r.tab && !inNew) return void switchTab(r.tab).then(() => toPage(r.tab));
    if (r?.kind === 'ask') return void askAgent(r.text ?? text);
    if (r?.kind === 'askpage') return onAskPage?.(r.text ?? text);
    if (r?.kind === 'do') return onDoHere?.(r.text ?? text);
    const target = r ? (r.kind === 'search' ? r.text : r.url) : text;
    if (!target) return;
    void goTo(target, inNew ? { newTab: true, ...(tab?.private ? { private: true } : {}) } : { tab: tab?.id }).then(() => !inNew && toPage(tab?.id));
  };
  const take = () => {
    setTyped(typed + completion);
    setCompletion('');
    noInline.current = true;
  };

  const shown = splitAddress(url);
  // At rest (not being typed in) an address shows as its site and the rest; the input is still there to click into.
  const atRest = !editing && !!url && url !== 'about:blank';
  const kind = connectionOf(url);
  const secure = kind === 'secure';

  return (
    <div ref={box} className="relative flex h-9 min-w-0 flex-1 items-center rounded-[10px] bg-bg-2 ring-1 ring-line-2 transition-shadow focus-within:ring-accent/60">
      {tab?.private && <PrivateChip compact={compact} />}
      {url && url !== 'about:blank' ? (
        <button
          ref={lock}
          aria-label="Site information"
          title={secure ? 'The connection is secure' : kind === 'insecure' ? 'Not secure' : 'Site information'}
          disabled={kind === 'other'}
          onClick={() => setInfo((i) => !i)}
          className={cx('ml-1 flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[12px] hover:bg-bg-3 disabled:pointer-events-none', info && 'bg-bg-3')}
        >
          {secure ? <Lock size={14} className="text-fg-2" /> : kind === 'insecure' ? <LockOpen size={14} className="text-warn" /> : <Info size={14} className="text-fg-3" />}
          {kind === 'insecure' && !editing && !compact && <span className="text-warn">Not secure</span>}
        </button>
      ) : (
        <Search size={14} className="mx-3 shrink-0 text-fg-3" />
      )}
      <div className="relative h-full min-w-0 flex-1">
      <input
        ref={inputRef}
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        role="combobox"
        aria-expanded={open && rows.length > 0}
        aria-autocomplete="both"
        onFocus={(e) => {
          // The keys came back with the window: the box goes on as you left it.
          if (held.current) return void (held.current = false);
          setEditing(true);
          setTyped(shownAddress(url));
          setCompletion('');
          setDirty(false);
          e.target.select();
        }}
        onBlur={(e) => {
          close();
          // Still the page's focused element: the page itself lost the keys, to another window or to your tab's page (which
          // the app says, above). The box keeps what you typed for when they come back, as in any browser; an older desktop
          // app does not say when your tab took them, so there the box lets go at once.
          if (document.activeElement === e.currentTarget) {
            const d = desktopBrowser();
            if (!d || d.onPageFocus) return void (held.current = true);
            e.currentTarget.blur();
          }
          held.current = false;
          setEditing(false);
          setDirty(false);
          setCompletion('');
        }}
        onChange={(e) => {
          const t = e.target.value;
          // Deleting keeps the completion off until you type something else.
          noInline.current = /^delete/.test((e.nativeEvent as InputEvent).inputType ?? '');
          setTyped(t);
          setCompletion('');
          setSel(-1);
          setDirty(true);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          const el = e.currentTarget;
          if (e.key === 'Enter') {
            e.preventDefault();
            choose(row, e.altKey || e.ctrlKey || e.metaKey);
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (!rows.length) return;
            e.preventDefault();
            setOpen(true);
            setCompletion('');
            setHover(-1);
            setSel((s) => (e.key === 'ArrowDown' ? (s + 1 >= rows.length ? -1 : s + 1) : s - 1 < -1 ? rows.length - 1 : s - 1));
          } else if ((e.key === 'Tab' && !e.shiftKey && completion) || (e.key === 'ArrowRight' && completion && el.selectionStart === typed.length)) {
            e.preventDefault();
            take();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            if (open && (rows.length || completion)) {
              close();
              setCompletion('');
            } else finish();
          } else if (e.key === 'Delete' && e.shiftKey && row?.kind === 'history' && row.url) {
            e.preventDefault();
            const gone = row.url;
            void forgetAddress(gone).then(() => setResult((r) => r && { ...r, items: r.items.filter((i) => !(i.kind === 'history' && i.url === gone)) }));
            setSel(-1);
          } else if (e.key === 'Backspace' || e.key === 'Delete') noInline.current = true;
        }}
        placeholder="Search, open, ask, or tell an agent what to do"
        aria-label="Address"
        translate="no"
        // At rest its text is hidden under the site and the rest, which are shorter: a selection left in it must not show.
        className={cx('h-full w-full min-w-0 bg-transparent px-2 text-[13.5px] outline-none placeholder:text-fg-3', atRest && 'text-transparent selection:bg-transparent')}
      />
      {atRest && (
        <div translate="no" aria-hidden className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-2 text-[13.5px] whitespace-nowrap">
          <span className="shrink-0 text-fg">{shown.site}</span>
          <span className="min-w-0 truncate text-fg-3">{shown.rest}</span>
        </div>
      )}
    </div>
    {!editing && !compact && <Kbd>{MOD}L</Kbd>}
      {percent !== 100 && tab && (
        <button
          aria-label="Back to 100 %"
          title="Back to 100 %"
          onClick={() => void desktopBrowser()?.zoom(tab.id, 'reset').then((z) => useTabState.setState((s) => ({ byTab: { ...s.byTab, [tab.id]: { ...s.byTab[tab.id], zoom: z } } })))}
          className="tnum mx-0.5 flex h-6 shrink-0 items-center rounded-full bg-bg-3 px-2 text-[11.5px] text-fg-2 hover:text-fg"
        >
          {percent}%
        </button>
      )}
      {tab && <TranslateButton tab={tab} />}
      {tab && <ReaderButtons tab={tab} />}
      <button
        aria-label={starred ? 'Remove the bookmark' : 'Bookmark this page'}
        title={starred ? 'Remove the bookmark' : 'Bookmark this page'}
        disabled={!canStar}
        onClick={onStar}
        className="mr-1 ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-3 hover:bg-bg-3 hover:text-fg disabled:pointer-events-none disabled:opacity-40"
      >
        <Star size={15} className={cx(starred && 'fill-warn text-warn')} />
      </button>
      {tab && /^https?:/i.test(url) && <SiteInfo anchor={lock} open={info} onClose={() => setInfo(false)} tab={tab} />}
      {open && at && rows.length > 0 &&
        createPortal(
          <>
            {/* Over the page too: the app's native page is taken away while this is open, and a click on it closes the list. */}
            <div className="fixed inset-x-0 bottom-0 z-40" style={{ top: at.top }} onPointerDown={finish} aria-hidden />
            <div
              role="listbox"
              // The bar keeps the focus: a click on a row must not blur it before the row takes it.
              onMouseDown={(e) => e.preventDefault()}
              style={{ left: at.left, top: at.top, width: at.width }}
              className="fixed z-50 overflow-hidden rounded-xl border border-line bg-elevated p-1 shadow-lg"
            >
              {rows.map((r, i) => (
                <RowView key={r.id} r={r} active={hover >= 0 ? i === hover : i === sel} words={words} engine={ENGINE_NAMES[prefs?.engine ?? 'google']} onHover={() => setHover(i)} onPick={(e) => choose(r, e.ctrlKey || e.metaKey || e.altKey)} />
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

function RowView({ r, active, words, engine, onHover, onPick }: { r: Row; active: boolean; words: string[]; engine: string; onHover: () => void; onPick: (e: React.MouseEvent) => void }) {
  const Icon = ICONS[r.kind];
  return (
    <div role="option" aria-selected={active} onMouseMove={onHover} onClick={onPick} style={{ height: ROW }} className={cx('flex cursor-default items-center gap-2.5 rounded-lg px-2.5 text-[13.5px]', active ? 'bg-bg-3' : '')}>
      <Icon size={15} className={cx('shrink-0', r.kind === 'ask' || r.kind === 'askpage' || r.kind === 'do' ? 'text-accent' : 'text-fg-3')} />
      {r.kind === 'ask' ? (
        <span className="min-w-0 flex-1 truncate">
          Ask an agent: <span translate="no">“{r.title}”</span>
        </span>
      ) : r.kind === 'askpage' ? (
        <span className="min-w-0 flex-1 truncate">
          Ask about this page: <span translate="no">“{r.title}”</span>
        </span>
      ) : r.kind === 'do' ? (
        <span className="min-w-0 flex-1 truncate">
          Do it in a tab of its own: <span translate="no">“{r.title}”</span>
        </span>
      ) : r.kind === 'search' ? (
        <>
          <span translate="no" className="min-w-0 flex-1 truncate">
            <Marked text={r.title} words={words} />
          </span>
          {r.id === 'typed' && <span className="shrink-0 text-[12px] text-fg-3">Search {engine}</span>}
        </>
      ) : (
        <>
          <span translate="no" className="min-w-0 shrink truncate">
            <Marked text={r.title} words={r.meaning ? [] : words} />
          </span>
          {r.url && r.url !== r.title && (
            <span translate="no" className="min-w-0 flex-1 truncate text-[12.5px] text-fg-3">
              <Marked text={stripScheme(r.url)} words={r.meaning ? [] : words} />
            </span>
          )}
          {r.kind === 'tab' && <span className="ml-auto shrink-0 text-[12px] text-fg-3">Switch to tab</span>}
        </>
      )}
    </div>
  );
}
