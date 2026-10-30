// Suggestions while typing a message: "@" offers files in the session's folder (inserted as @path),
// "/" at the start offers the agent's slash commands and skills. Arrows move, Enter or Tab inserts,
// Escape closes.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { FileText, Slash } from 'lucide-react';
import { api } from '../lib/api';
import { cx } from './ui';

interface Suggestion {
  key: string;
  label: string;
  hint?: string;
  insert: string;
  kind: 'file' | 'command';
}

type Token = { kind: '@' | '/'; start: number; query: string } | null;

/** The "@word" or leading "/word" the caret is in, if any. */
function tokenAt(el: HTMLTextAreaElement): Token {
  const before = el.value.slice(0, el.selectionStart);
  const at = /(^|\s)@([^\s@]*)$/.exec(before);
  if (at) return { kind: '@', start: before.length - at[2].length - 1, query: at[2] };
  const slash = /^\/([\w:.-]*)$/.exec(before);
  if (slash) return { kind: '/', start: 0, query: slash[1] };
  return null;
}

export function useComposerMenu({
  ta,
  setText,
  root,
  commands,
}: {
  ta: RefObject<HTMLTextAreaElement | null>;
  setText: (t: string) => void;
  /** The folder files come from. */
  root?: string;
  commands?: { name: string; description?: string; argumentHint?: string }[];
}) {
  const [tok, setTok] = useState<Token>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tok) return setItems([]);
    if (tok.kind === '/') {
      const q = tok.query.toLowerCase();
      const list = (commands ?? [])
        .filter((c) => c.name.toLowerCase().includes(q))
        .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
        .slice(0, 8)
        .map((c) => ({ key: c.name, label: `/${c.name}`, hint: c.argumentHint || c.description, insert: `/${c.name} `, kind: 'command' as const }));
      setItems(list);
      setSel(0);
      return;
    }
    if (!root) return setItems([]);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      api<{ files: string[] }>(`/api/fs/find?root=${encodeURIComponent(root)}&q=${encodeURIComponent(tok.query)}`, { signal: ctl.signal })
        .then((r) => {
          setItems(
            r.files.slice(0, 8).map((f) => {
              const rel = f.startsWith(root.replace(/\/+$/, '') + '/') ? f.slice(root.replace(/\/+$/, '').length + 1) : f;
              return { key: f, label: rel.split('/').pop() ?? rel, hint: rel, insert: `@${rel} `, kind: 'file' as const };
            }),
          );
          setSel(0);
        })
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [tok, root, commands]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const pick = (s: Suggestion) => {
    const el = ta.current;
    if (!el || !tok) return;
    const end = el.selectionStart;
    const next = el.value.slice(0, tok.start) + s.insert + el.value.slice(end);
    setText(next);
    setTok(null);
    const caret = tok.start + s.insert.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  /** Call after every change and caret move. */
  const update = () => {
    const el = ta.current;
    setTok(el ? tokenAt(el) : null);
  };

  /** Call first in the box's onKeyDown; true when the menu used the key. */
  const onKeyDown = (e: React.KeyboardEvent): boolean => {
    if (!tok || !items.length) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((v) => (v + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
      return true;
    }
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
      e.preventDefault();
      pick(items[sel]);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setTok(null);
      return true;
    }
    return false;
  };

  const node =
    tok && items.length ? (
      <div ref={listRef} className="anim-pop absolute inset-x-3 bottom-full z-20 mb-2 max-h-72 overflow-y-auto rounded-xl border border-line bg-elevated p-1 shadow-lg">
        {items.map((s, i) => (
          <button
            key={s.key}
            data-i={i}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(s)}
            onMouseMove={() => sel !== i && setSel(i)}
            className={cx('flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px]', i === sel ? 'bg-bg-2 text-fg' : 'text-fg-2')}
          >
            {s.kind === 'file' ? <FileText size={13} className="shrink-0 text-fg-3" /> : <Slash size={13} className="shrink-0 text-fg-3" />}
            <span className={cx('shrink-0 truncate', s.kind === 'command' && 'font-mono text-[12.5px]')}>{s.label}</span>
            {s.hint && <span className="min-w-0 flex-1 truncate text-right text-[11.5px] text-fg-3">{s.hint}</span>}
          </button>
        ))}
      </div>
    ) : null;

  return { update, onKeyDown, node, open: !!(tok && items.length) };
}
