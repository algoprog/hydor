// A field of code in the slides editor's side panel, as the app's file editor has it (CodeMirror: its colours in
// either theme, its keys, its find bar), for a code part and a custom code part. It keeps its own text while it is
// typed in, and tells the deck after a short pause (one step to undo for a run of typing); a change from outside
// (Undo, a starter picked) comes in without moving the caret more than it must.
import { useEffect, useRef } from 'react';
import type { EditorHandle } from '../../../lib/codemirror';
import { cx } from '../../../components/ui';

const isDark = () => document.documentElement.classList.contains('dark');

/** A file name CodeMirror knows the language of, for a code part's language. */
const FILE: Record<string, string> = {
  python: 'code.py',
  javascript: 'code.js',
  typescript: 'code.ts',
  jsx: 'code.jsx',
  tsx: 'code.tsx',
  bash: 'code.sh',
  shell: 'code.sh',
  json: 'code.json',
  html: 'code.html',
  css: 'code.css',
  sql: 'code.sql',
  rust: 'code.rs',
  go: 'code.go',
  java: 'code.java',
  c: 'code.c',
  cpp: 'code.cpp',
  csharp: 'code.cs',
  php: 'code.php',
  ruby: 'code.rb',
  swift: 'code.swift',
  kotlin: 'code.kt',
  yaml: 'code.yaml',
  markdown: 'code.md',
  r: 'code.r',
};
export const fileFor = (lang: string | undefined) => FILE[(lang ?? '').toLowerCase()] ?? 'code.txt';

export function CodeField({ value, onChange, file, label, className }: { value: string; onChange: (v: string) => void; file: string; label: string; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<EditorHandle | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  // What the field holds, and what it last told the deck: a value from outside that differs from both comes in.
  const mine = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const v = handle.current?.view.state.doc.toString();
    if (v !== undefined && v !== value) cb.current(v);
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    let alive = true;
    let h: EditorHandle | null = null;
    const el = host.current;
    import('../../../lib/codemirror').then(async ({ createEditor }) => {
      if (!alive || !el) return;
      h = await createEditor(el, {
        doc: mine.current,
        path: file,
        dark: isDark(),
        wrap: true,
        phone: matchMedia('(pointer: coarse)').matches,
        onChange: (d) => {
          mine.current = d;
          clearTimeout(timer.current);
          timer.current = setTimeout(() => flushRef.current(), 250);
        },
        onSave: () => flushRef.current(),
      });
      if (!alive) return h.destroy();
      handle.current = h;
      h.view.contentDOM.setAttribute('aria-label', label);
    });
    const mo = new MutationObserver(() => h?.setDark(isDark()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      alive = false;
      mo.disconnect();
      // What was typed last goes in before the field goes.
      if (timer.current) flushRef.current();
      h?.destroy();
      handle.current = null;
    };
    // Another language is another field (the parent keys it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (value === mine.current || timer.current) return;
    mine.current = value;
    handle.current?.setDoc(value);
  }, [value]);
  return (
    <div
      ref={host}
      translate="no"
      // The editor's own keys (Undo, Delete, the arrows) stay in the field.
      onKeyDown={(e) => e.stopPropagation()}
      onBlur={() => timer.current && flush()}
      className={cx('overflow-hidden rounded-lg border border-line bg-bg focus-within:border-accent/60 [&_.cm-editor]:h-full [&_.cm-editor]:outline-none [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-[12px]', className)}
    />
  );
}
