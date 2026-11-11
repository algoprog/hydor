// The documents editor's dialogs and small boxes: the word count (of the document, or of the words picked: words,
// characters with and without spaces, paragraphs, pages and reading time), custom line and paragraph spacing, the
// header and footer (with the page's number and count, and a first page without them), the language the words are in
// (the browser's spell check and Word's proofing go by it), and the box an equation is written in, LaTeX with its
// preview drawn as it is typed.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Hash } from 'lucide-react';
import { LOCALE } from '../../../i18n/locale';
import { Button, cx, Dialog, inputCls, Segmented, Switch } from '../../../components/ui';
import type { Band } from '@shared/docs';
import { useTexHtml } from '../common/katex';
import { NumInput } from '../slides/controls';
import { Select } from '../studio/fields';

export interface Counts {
  words: number;
  chars: number;
  charsNoSpaces: number;
  paragraphs: number;
  pages: number;
}

const n = (x: number) => x.toLocaleString(LOCALE);

export function WordCountDialog({ open, onClose, counts, picked, showCount, setShowCount }: { open: boolean; onClose: () => void; counts: Counts; picked: boolean; showCount: boolean; setShowCount: (on: boolean) => void }) {
  const minutes = Math.max(1, Math.round(counts.words / 230));
  const rows: [string, string][] = [
    ['Pages', n(counts.pages)],
    ['Words', n(counts.words)],
    ['Characters', n(counts.chars)],
    ['Characters without spaces', n(counts.charsNoSpaces)],
    ['Paragraphs', n(counts.paragraphs)],
    ['Reading time', counts.words ? `${minutes} min` : '—'],
  ];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Word count"
      width={380}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <p className="mb-2 text-[12.5px] text-fg-3">{picked ? 'Of the words picked.' : 'Of the whole document.'}</p>
      <div className="divide-y divide-line rounded-xl border border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-3 py-2 text-[13.5px]">
            <span className="text-fg-2">{k}</span>
            <span className="font-medium text-fg tabular-nums">{v}</span>
          </div>
        ))}
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-3 text-[13.5px] text-fg">
        <span className="min-w-0 flex-1">Show the word count while typing</span>
        <Switch on={showCount} onChange={setShowCount} label="Show the word count while typing" />
      </label>
    </Dialog>
  );
}

export function SpacingDialog({ open, onClose, value, onApply }: { open: boolean; onClose: () => void; value: { lh?: number; sb?: number; sa?: number }; onApply: (v: { lh: number; sb: number; sa: number }) => void }) {
  const [lh, setLh] = useState(value.lh ?? 1.15);
  const [sb, setSb] = useState(value.sb ?? 0);
  const [sa, setSa] = useState(value.sa ?? 8);
  useEffect(() => {
    if (!open) return;
    setLh(value.lh ?? 1.15);
    setSb(value.sb ?? 0);
    setSa(value.sa ?? 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Custom spacing"
      width={380}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => (onApply({ lh, sb, sa }), onClose())}>
            Apply
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 text-[13.5px] text-fg-2">Line spacing</span>
          <NumInput value={lh} onChange={setLh} min={0.5} max={5} step={0.05} unit="lines" label="Line spacing" className="w-[120px]" />
        </div>
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 text-[13.5px] text-fg-2">Space before the paragraph</span>
          <NumInput value={sb} onChange={setSb} min={0} max={200} step={1} unit="pt" label="Space before the paragraph" className="w-[120px]" />
        </div>
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 text-[13.5px] text-fg-2">Space after the paragraph</span>
          <NumInput value={sa} onChange={setSa} min={0} max={200} step={1} unit="pt" label="Space after the paragraph" className="w-[120px]" />
        </div>
      </div>
    </Dialog>
  );
}

type Align = 'left' | 'center' | 'right';
const ALIGN_OPTIONS: { value: Align; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' },
];

/** The header and footer: their words (with the page's number and count), alignment, and a first page without them. */
export function BandsDialog({
  open,
  onClose,
  header,
  footer,
  titlePage,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  header?: Band;
  footer?: Band;
  titlePage?: boolean;
  onApply: (v: { header: Band | null; footer: Band | null; titlePage: boolean }) => void;
}) {
  const [h, setH] = useState({ text: '', align: 'left' as Align });
  const [f, setF] = useState({ text: '', align: 'left' as Align });
  const [first, setFirst] = useState(false);
  const last = useRef<'h' | 'f'>('h');
  const hRef = useRef<HTMLInputElement>(null);
  const fRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setH({ text: header?.text ?? '', align: header?.align ?? 'left' });
    setF({ text: footer?.text ?? '', align: footer?.align ?? 'left' });
    setFirst(!!titlePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  /** A page field put in the field last written in, where its caret is. */
  const put = (token: string) => {
    const el = last.current === 'h' ? hRef.current : fRef.current;
    const cur = last.current === 'h' ? h : f;
    const at = el?.selectionStart ?? cur.text.length;
    const text = cur.text.slice(0, at) + token + cur.text.slice(el?.selectionEnd ?? at);
    (last.current === 'h' ? setH : setF)({ ...cur, text });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  };
  const band = (b: { text: string; align: Align }): Band | null => (b.text.trim() ? { text: b.text.trim(), ...(b.align !== 'left' ? { align: b.align } : {}) } : null);
  const row = (label: string, v: { text: string; align: Align }, set: (x: { text: string; align: Align }) => void, ref: RefObject<HTMLInputElement | null>, which: 'h' | 'f') => (
    <div className="space-y-1.5">
      <div className="text-[12px] text-fg-3">{label}</div>
      <input ref={ref} value={v.text} onChange={(e) => set({ ...v, text: e.target.value })} onFocus={() => (last.current = which)} placeholder="Words on every page" translate="no" className={inputCls} />
      <Segmented size="sm" value={v.align} onChange={(a) => set({ ...v, align: a })} options={ALIGN_OPTIONS} />
    </div>
  );
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Header and footer"
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => (onApply({ header: band(h), footer: band(f), titlePage: first }), onClose())}>
            Apply
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {row('Header', h, setH, hRef, 'h')}
        {row('Footer', f, setF, fRef, 'f')}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" icon={<Hash size={14} />} onMouseDown={(e) => e.preventDefault()} onClick={() => put('{page}')}>
            Page number
          </Button>
          <Button size="sm" variant="ghost" icon={<Hash size={14} />} onMouseDown={(e) => e.preventDefault()} onClick={() => put('{pages}')}>
            Number of pages
          </Button>
        </div>
        <label className="flex cursor-pointer items-center gap-3 text-[13.5px] text-fg">
          <span className="min-w-0 flex-1">Different first page (none on it)</span>
          <Switch on={first} onChange={setFirst} label="Different first page" />
        </label>
        <p className="text-[11.5px] leading-relaxed text-fg-3">{'{page} and {pages} show as the page’s number and how many pages there are, in the PDF, in Word and when printed.'}</p>
      </div>
    </Dialog>
  );
}

/** LaTeX snippets the equation box offers, with what they look like. */
const SNIPPETS: [string, string][] = [
  ['\\frac{a}{b}', 'a/b'],
  ['x^{2}', 'x²'],
  ['x_{i}', 'xᵢ'],
  ['\\sqrt{x}', '√x'],
  ['\\sum_{i=1}^{n}', '∑'],
  ['\\int_{a}^{b}', '∫'],
  ['\\alpha', 'α'],
  ['\\pi', 'π'],
  ['\\le', '≤'],
  ['\\ne', '≠'],
  ['\\infty', '∞'],
  ['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', '( )'],
];

/** The box an equation is written in: its LaTeX, a preview drawn as it is typed, and a few things to put in. */
export function EquationBox({ initial, display, onDone, onRemove, onCancel }: { initial: string; display: boolean; onDone: (tex: string) => void; onRemove?: () => void; onCancel: () => void }) {
  const [tex, setTex] = useState(initial);
  const area = useRef<HTMLTextAreaElement>(null);
  const html = useTexHtml(tex || '\\square', display);
  useEffect(() => {
    area.current?.focus();
    area.current?.select();
  }, []);
  const put = (s: string) => {
    const el = area.current;
    const a = el?.selectionStart ?? tex.length;
    const z = el?.selectionEnd ?? a;
    setTex(tex.slice(0, a) + s + tex.slice(z));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(a + s.length, a + s.length);
    });
  };
  return (
    <div className="space-y-2 p-2" data-keeps-editing>
      <div className={cx('flex min-h-14 items-center justify-center overflow-x-auto rounded-lg bg-white px-3 py-2 text-[#1f2328]', !tex && 'opacity-40')} translate="no" dangerouslySetInnerHTML={{ __html: html ?? '' }} />
      <textarea
        ref={area}
        value={tex}
        onChange={(e) => setTex(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
            e.preventDefault();
            onDone(tex);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        rows={2}
        spellCheck={false}
        placeholder="LaTeX: \frac{a}{b}, x^2, \sqrt{x}, \alpha…"
        translate="no"
        className={cx(inputCls, 'h-auto min-h-[60px] resize-y py-1.5 font-mono text-[12.5px]')}
      />
      <div className="flex flex-wrap gap-1">
        {SNIPPETS.map(([s, show]) => (
          <button key={s} type="button" title={s} onMouseDown={(e) => e.preventDefault()} onClick={() => put(s)} className="h-7 min-w-8 rounded-md border border-line px-1.5 font-serif text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg" translate="no">
            {show}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        {onRemove && (
          <Button size="sm" variant="ghost" onClick={onRemove} className="mr-auto text-err">
            Delete
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={() => onDone(tex)} disabled={!tex.trim()}>
          Done
        </Button>
      </div>
    </div>
  );
}

/** Format → Bullets and numbering → Start at: the number the picked item's list is to start from (from that item on). */
export function NumberStartDialog({ open, onClose, value, onApply }: { open: boolean; onClose: () => void; value: number; onApply: (n: number) => void }) {
  const [n, setN] = useState(value);
  useEffect(() => {
    if (open) setN(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Start at"
      width={340}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => (onApply(n), onClose())}>
            Apply
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 text-[13.5px] text-fg-2">The number this item has</span>
        <NumInput value={n} onChange={setN} min={0} max={9999} step={1} label="The number this item has" className="w-[120px]" />
      </div>
    </Dialog>
  );
}

/** The languages the document's words can be said to be in: their tags, and their names in their own words. */
export const DOC_LANGUAGES: [string, string][] = [
  ['en-US', 'English (US)'],
  ['en-GB', 'English (UK)'],
  ['el', 'Ελληνικά'],
  ['de', 'Deutsch'],
  ['fr', 'Français'],
  ['es', 'Español'],
  ['it', 'Italiano'],
  ['pt', 'Português'],
  ['nl', 'Nederlands'],
  ['sv', 'Svenska'],
  ['pl', 'Polski'],
  ['cs', 'Čeština'],
  ['tr', 'Türkçe'],
  ['ru', 'Русский'],
  ['uk', 'Українська'],
  ['ar', 'العربية'],
  ['he', 'עברית'],
  ['hi', 'हिन्दी'],
  ['zh-CN', '简体中文'],
  ['zh-TW', '繁體中文'],
  ['ja', '日本語'],
  ['ko', '한국어'],
];

/** Tools → Language: the language the document's words are in (none: not said; the browser then guesses by its own). */
export function LanguageDialog({ open, onClose, value, onApply }: { open: boolean; onClose: () => void; value: string | undefined; onApply: (lang: string | undefined) => void }) {
  const [lang, setLang] = useState(value ?? '');
  useEffect(() => {
    if (open) setLang(value ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // A tag of a language not in the list (an agent's, a Word file's) stays choosable as it is.
  const known = !lang || DOC_LANGUAGES.some(([t]) => t === lang);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Language"
      width={380}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => (onApply(lang || undefined), onClose())}>
            Apply
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] leading-relaxed text-fg-3">The language the words are in. The browser checks the spelling by it, and Word files say their text is in it.</p>
        <Select
          value={lang}
          title="The document’s language"
          onChange={setLang}
          options={[{ value: '', label: 'Not set' }, ...(known ? [] : [{ value: lang, label: lang }]), ...DOC_LANGUAGES.map(([t, name]) => ({ value: t, label: name }))]}
        />
      </div>
    </Dialog>
  );
}
