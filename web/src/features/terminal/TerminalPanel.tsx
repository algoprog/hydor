import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { ChevronDown, Plus, Sparkles, SquareTerminal, X } from 'lucide-react';
import { api, del, post } from '../../lib/api';
import { basename, tildify } from '../../lib/format';
import { go } from '../../lib/nav';
import { toastError, useApp, useUI } from '../../lib/store';
import { PageHeader } from '../layout/PageHeader';
import { cx, Dots, IconButton, useConfirm } from '../../components/ui';
import { Suggester, type SuggestView } from './suggest';
import { TermSuggest } from './TermSuggest';
import { machineBase, machineKey } from '../../lib/machine';

export interface TerminalInfo {
  id: string;
  name: string;
  cwd: string;
  command: string;
  createdAt: number;
  attached: number;
}

export const useTerms = create<{ list: TerminalInfo[]; active: string | null; loaded: boolean }>(() => ({
  list: [],
  active: localStorage.getItem(machineKey('wa.term.active')),
  loaded: false,
}));

useTerms.subscribe((s) => {
  if (s.active) localStorage.setItem(machineKey('wa.term.active'), s.active);
});

export async function loadTerms() {
  try {
    const r = await api<{ terminals: TerminalInfo[] }>('/api/terminals');
    const s = useTerms.getState();
    const active = r.terminals.some((t) => t.id === s.active) ? s.active : (r.terminals[r.terminals.length - 1]?.id ?? null);
    useTerms.setState({ list: r.terminals, active, loaded: true });
  } catch {}
}

export async function newTerminal(cwd?: string) {
  const t = await post<TerminalInfo>('/api/terminals', { cwd: cwd ?? useUI.getState().explorerRoot ?? useApp.getState().boot?.defaultCwd });
  useTerms.setState((s) => ({ list: [...s.list.filter((x) => x.id !== t.id), t], active: t.id }));
  return t;
}

/** Shows a terminal the server just started (a login command, say): the panel on desktop, the page on phones. */
export function showTerminal(t: TerminalInfo) {
  useTerms.setState((s) => ({ list: [...s.list.filter((x) => x.id !== t.id), t], active: t.id }));
  if (window.matchMedia('(min-width: 768px)').matches) useUI.getState().set({ panelOpen: true });
  else go('/terminal');
}

/** Opens a fresh shell in `cwd`: the bottom panel on desktop, the terminal page on phones. */
export async function openTerminalAt(cwd: string) {
  try {
    await newTerminal(cwd);
    if (window.matchMedia('(min-width: 768px)').matches) useUI.getState().set({ panelOpen: true });
    else go('/terminal');
  } catch (e) {
    toastError(e);
  }
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// The ANSI colours programs print in, one set per base; the rest comes from the theme.
const ANSI_DARK = {
  black: '#1b1e24',
  red: '#f47067',
  green: '#57ab5a',
  yellow: '#c69026',
  blue: '#539bf5',
  magenta: '#b083f0',
  cyan: '#39c5cf',
  white: '#adbac7',
  brightBlack: '#636e7b',
  brightRed: '#ff938a',
  brightGreen: '#6bc46d',
  brightYellow: '#daaa3f',
  brightBlue: '#6cb6ff',
  brightMagenta: '#dcbdfb',
  brightCyan: '#56d4dd',
  brightWhite: '#cdd9e5',
};
const ANSI_LIGHT = {
  black: '#24292f',
  red: '#cf222e',
  green: '#116329',
  yellow: '#4d2d00',
  blue: '#0969da',
  magenta: '#8250df',
  cyan: '#1b7c83',
  white: '#6e7781',
  brightBlack: '#57606a',
  brightRed: '#a40e26',
  brightGreen: '#1a7f37',
  brightYellow: '#633c01',
  brightBlue: '#218bff',
  brightMagenta: '#a475f9',
  brightCyan: '#3192aa',
  brightWhite: '#8c959f',
};

function xtermTheme() {
  const dark = document.documentElement.classList.contains('dark');
  const bg = cssVar('--term-bg') || (dark ? '#0e0d0c' : '#faf9f6');
  const fg = cssVar('--term-fg') || (dark ? '#ddd7cc' : '#2b2721');
  const accent = cssVar('--accent');
  return {
    ...(dark ? ANSI_DARK : ANSI_LIGHT),
    background: bg,
    foreground: fg,
    cursor: fg,
    cursorAccent: bg,
    selectionBackground: /^#[0-9a-f]{6}$/i.test(accent) ? accent + (dark ? '52' : '3d') : dark ? 'rgba(110,168,254,0.30)' : 'rgba(37,99,235,0.22)',
  };
}

interface Mods {
  ctrl: boolean;
  alt: boolean;
  onUse?: () => void;
}

interface TermApi {
  send: (s: string) => void;
  focus: () => void;
  /** Sticky modifiers applied to the next key typed on the keyboard. */
  setMods: (m: Mods) => void;
  /** Shows or hides the suggestions list. */
  suggest: () => void;
  /** A key-bar key the suggestions use (→ takes the grey text; arrows, Tab, Esc in the list); true when used. */
  suggestKey: (seq: string) => boolean;
}

const TERM_FONT = { family: "'JetBrains Mono Variable', ui-monospace, Menlo, monospace", size: 13 };

function applyMods(d: string, m: Mods): string {
  let s = d;
  if (m.ctrl && s.length === 1 && /[a-z@\[\\\]^_]/i.test(s)) s = String.fromCharCode(s.toUpperCase().charCodeAt(0) & 0x1f);
  if (m.alt) s = '\x1b' + s;
  return s;
}

function TerminalView({ id, onReady }: { id: string; onReady?: (api: TermApi) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const mods = useRef<Mods>({ ctrl: false, alt: false });
  const sug = useRef<Suggester | null>(null);
  const [state, setState] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [view, setView] = useState<SuggestView>({ ghost: null, menu: null });
  const [fontSize] = useState(() => (window.matchMedia('(min-width: 768px)').matches ? 13 : 12));
  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | null = null;
    let term: import('@xterm/xterm').Terminal | null = null;
    let ro: ResizeObserver | null = null;
    const onTheme = () => {
      if (term) term.options.theme = xtermTheme();
    };
    let retry: number | null = null;
    (async () => {
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }, { Unicode11Addon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
        import('@xterm/addon-unicode11'),
        import('@xterm/xterm/css/xterm.css'),
      ]);
      if (disposed || !host.current) return;
      term = new Terminal({
        fontFamily: TERM_FONT.family,
        fontSize,
        lineHeight: 1.15,
        cursorBlink: true,
        scrollback: 20000,
        allowProposedApi: true,
        scrollOnEraseInDisplay: true,
        macOptionIsMeta: true,
        theme: xtermTheme(),
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon((_e, uri) => window.open(uri, '_blank', 'noopener')));
      term.loadAddon(new Unicode11Addon());
      term.unicode.activeVersion = '11';
      term.open(host.current);
      try {
        fit.fit();
      } catch {}
      const t = term;
      const sendIn = (d: string) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: 'in', d }));
      const sg = new Suggester(t, id, box.current!, sendIn, setView);
      sug.current = sg;
      const connect = () => {
        setState('connecting');
        const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${machineBase}/ws/term/${id}?cols=${t.cols}&rows=${t.rows}`;
        const sock = new WebSocket(url);
        ws = sock;
        let first = true;
        sock.onopen = () => setState('open');
        sock.onmessage = (m) => {
          if (first) {
            first = false;
            t.reset();
            sg.restart();
          }
          t.write(typeof m.data === 'string' ? m.data : '');
        };
        sock.onclose = (ev) => {
          setState('closed');
          if (disposed) return;
          // Reattach unless the shell itself ended.
          if (ev.reason !== 'detached') retry = window.setTimeout(connect, 1500);
          else loadTerms();
        };
      };
      connect();
      t.onData((d) => {
        const m = mods.current;
        let out = d;
        if (m.ctrl || m.alt) {
          out = applyMods(d, m);
          m.onUse?.();
          mods.current = { ctrl: false, alt: false };
        }
        sg.input(out);
        sendIn(out);
      });
      t.onResize(({ cols, rows }) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: 'resize', cols, rows })));
      ro = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {}
      });
      ro.observe(host.current);
      window.addEventListener('wa:theme', onTheme);
      onReady?.({
        send: (d) => {
          sg.input(d);
          sendIn(d);
        },
        focus: () => t.focus(),
        setMods: (m) => {
          mods.current = m;
        },
        suggest: () => {
          sg.toggle();
          t.focus();
        },
        suggestKey: (seq) => sg.key(seq),
      });
      if (window.matchMedia('(min-width: 768px)').matches) t.focus();
    })();
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      ro?.disconnect();
      window.removeEventListener('wa:theme', onTheme);
      sug.current?.dispose();
      sug.current = null;
      ws?.close();
      term?.dispose();
    };
  }, [id, onReady]);
  return (
    <div ref={box} className="relative h-full min-h-0 w-full bg-[var(--term-bg)]">
      <div ref={host} className="xterm-host absolute inset-0" />
      <TermSuggest view={view} font={{ family: TERM_FONT.family, size: fontSize }} onPick={(i) => sug.current?.pick(i)} />
      {state === 'connecting' && (
        <div className="pointer-events-none absolute top-2 right-3 text-fg-3">
          <Dots />
        </div>
      )}
    </div>
  );
}

const KEYS: { label: string; seq: string }[] = [
  { label: 'Esc', seq: '\x1b' },
  { label: 'Tab', seq: '\t' },
  { label: '↑', seq: '\x1b[A' },
  { label: '↓', seq: '\x1b[B' },
  { label: '←', seq: '\x1b[D' },
  { label: '→', seq: '\x1b[C' },
  { label: '|', seq: '|' },
  { label: '/', seq: '/' },
  { label: '-', seq: '-' },
  { label: '~', seq: '~' },
  { label: 'Home', seq: '\x1b[H' },
  { label: 'End', seq: '\x1b[F' },
];

/** Keys phone keyboards lack. Ctrl/Alt stick until the next key, typed here or on the keyboard. */
function ExtraKeys({ api: term }: { api: TermApi | null }) {
  const [ctrl, setCtrl] = useState(false);
  const [alt, setAlt] = useState(false);
  const arm = (c: boolean, a: boolean) => {
    setCtrl(c);
    setAlt(a);
    term?.setMods({
      ctrl: c,
      alt: a,
      onUse: () => {
        setCtrl(false);
        setAlt(false);
      },
    });
    term?.focus();
  };
  const send = (seq: string) => {
    if (!term) return;
    if (!ctrl && !alt && term.suggestKey(seq)) return;
    term.send(applyMods(seq, { ctrl, alt }));
    arm(false, false);
  };
  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto border-t border-line bg-bg-1 px-1.5 py-1.5 pb-[max(6px,var(--safe-bottom))] [&::-webkit-scrollbar]:hidden">
      <button onClick={() => arm(!ctrl, alt)} className={cx('h-8 shrink-0 rounded-md px-2.5 font-mono text-[12px]', ctrl ? 'bg-accent text-accent-fg' : 'bg-bg-3 text-fg')}>
        Ctrl
      </button>
      <button onClick={() => arm(ctrl, !alt)} className={cx('h-8 shrink-0 rounded-md px-2.5 font-mono text-[12px]', alt ? 'bg-accent text-accent-fg' : 'bg-bg-3 text-fg')}>
        Alt
      </button>
      <button onClick={() => term?.suggest()} aria-label="Suggestions" className="flex h-8 shrink-0 items-center rounded-md bg-bg-3 px-2.5 text-accent">
        <Sparkles size={14} />
      </button>
      {['c', 'd', 'z', 'l', 'r'].map((k) => (
        <button key={k} onClick={() => term?.send(String.fromCharCode(k.charCodeAt(0) & 0x1f))} className="h-8 shrink-0 rounded-md bg-bg-3 px-2 font-mono text-[12px] text-fg-2">
          ^{k.toUpperCase()}
        </button>
      ))}
      {KEYS.map((k) => (
        <button key={k.label} onClick={() => send(k.seq)} className="h-8 min-w-8 shrink-0 rounded-md bg-bg-3 px-2 font-mono text-[12px] text-fg">
          {k.label}
        </button>
      ))}
    </div>
  );
}

export function TerminalPanel({ page }: { page?: boolean }) {
  const { list, active, loaded } = useTerms();
  const home = useApp((s) => s.boot?.home);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [termApi, setTermApi] = useState<TermApi | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const onReady = useCallback((a: TermApi) => setTermApi(a), []);
  // Phone keyboards lack Esc, Ctrl and arrows; desktops have them.
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    loadTerms().then(() => {
      if (!useTerms.getState().list.length) newTerminal().catch(toastError);
    });
    const t = setInterval(loadTerms, 6000);
    return () => clearInterval(t);
  }, []);

  const close = async (t: TerminalInfo) => {
    if (t.command && !/^(bash|zsh|sh|fish)$/.test(t.command)) {
      const ok = await confirm({ title: `Close ${t.name || t.id}?`, body: `${t.command} is still running in it. Closing ends the shell and everything it runs.`, confirm: 'Close', danger: true });
      if (!ok) return;
    }
    await del(`/api/terminals/${t.id}`).catch(toastError);
    await loadTerms();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-1">
      <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2 [&::-webkit-scrollbar]:hidden">
        {!page && <SquareTerminal size={15} className="mx-1.5 shrink-0 text-fg-3" />}
        {list.map((t) => (
          <div
            key={t.id}
            onClick={() => useTerms.setState({ active: t.id })}
            onDoubleClick={() => setRenaming(t.id)}
            className={cx(
              'group flex h-7.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg pr-1 pl-3 text-[12.5px] transition-colors',
              t.id === active ? 'bg-bg-3 text-fg' : 'text-fg-3 hover:bg-bg-2 hover:text-fg-2',
            )}
            title={`${t.cwd} · ${t.command}`}
          >
            {renaming === t.id ? (
              <input
                autoFocus
                defaultValue={t.name || basename(t.cwd)}
                onBlur={async (e) => {
                  setRenaming(null);
                  await post(`/api/terminals/${t.id}/rename`, { name: e.target.value }).catch(toastError);
                  loadTerms();
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="h-5 w-28 rounded border border-accent/60 bg-bg-1 px-1 outline-none"
              />
            ) : (
              <span className="max-w-[160px] truncate">
                {t.name || basename(tildify(t.cwd, home)) || '~'}
                {t.command && !/^(bash|zsh|sh|fish)$/.test(t.command) && <span className="text-fg-3"> · {t.command}</span>}
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                close(t);
              }}
              className="flex h-4.5 w-4.5 items-center justify-center rounded opacity-60 hover:bg-bg-3 hover:opacity-100"
              aria-label="Close terminal"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <IconButton label="New terminal" size="sm" onClick={() => newTerminal().catch(toastError)}>
          <Plus size={14} />
        </IconButton>
        <span className="flex-1" />
        <IconButton label="Suggestions (Ctrl+Space)" size="sm" onClick={() => termApi?.suggest()}>
          <Sparkles size={14} />
        </IconButton>
        {!page && (
          <IconButton label="Hide panel" size="sm" onClick={() => useUI.getState().set({ panelOpen: false })}>
            <ChevronDown size={14} />
          </IconButton>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {!loaded ? (
          <div className="flex h-full items-center justify-center text-fg-3">
            <Dots />
          </div>
        ) : active && list.some((t) => t.id === active) ? (
          <TerminalView key={active} id={active} onReady={onReady} />
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] text-fg-3">No terminal open</div>
        )}
      </div>
      {page && touch && <ExtraKeys api={termApi} />}
      {confirmNode}
    </div>
  );
}

export function TerminalPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Terminal" sub="Shells on this machine. They keep running when you leave this page." />
      <div className="min-h-0 flex-1">
        <TerminalPanel page />
      </div>
    </div>
  );
}
