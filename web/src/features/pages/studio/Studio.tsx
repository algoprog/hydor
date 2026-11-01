// A page to use, change and save: the same in the panel beside a conversation, full screen on a phone, and
// at a page's own place in Pages. Three ways to look at it: the page itself (it runs), Edit (pick a part
// and change it: words, look, place; scripts held back meanwhile) and Code (its HTML, with the page beside
// it as you type). While an agent writes it, it shows as far as it came, growing. Changes stay unsaved
// until Save; Discard drops them.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Code2, Eye, Monitor, PenLine, Plus, Redo2, Smartphone, Tablet, Undo2 } from 'lucide-react';
import { toastError } from '../../../lib/store';
import { Button, cx, IconButton, MenuItem, Popover, Segmented, Throbber, useConfirm, useMediaQuery } from '../../../components/ui';
import type { EditorHandle } from '../../../lib/codemirror';
import { DeviceStage, EditFrame, PageFrame, StreamFrame, withBase, type Device, type EdSel, type EditHandle, type EdState, type Pick, type Store } from '../frame';
import { BLOCKS, editorLabels } from './blocks';
import { Inspector } from './Inspector';

export type StudioMode = 'view' | 'edit' | 'code';

export interface StudioDoc {
  /** Changes when it is another page (or another version of it). */
  key: string;
  title: string;
  html: string;
  /** An HTML file's folder, for its relative addresses. */
  base?: string;
  /** A saved page's storage; a shown page keeps what it stores while on screen. */
  store: Store;
}

const isDark = () => document.documentElement.classList.contains('dark');
const DEVICES: { value: Device; label: string; icon: ReactNode }[] = [
  { value: 'desktop', label: 'Computer', icon: <Monitor size={14} /> },
  { value: 'tablet', label: 'Tablet', icon: <Tablet size={14} /> },
  { value: 'phone', label: 'Phone', icon: <Smartphone size={14} /> },
];
const DEVICE_KEY = 'wa.studio.device';

/** The HTML, with the editor's colours and keys: it saves on Ctrl+S. */
function CodePane({ html, onChange, onSave, className }: { html: string; onChange: (v: string) => void; onSave: () => void; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef({ onChange, onSave });
  cb.current = { onChange, onSave };
  useEffect(() => {
    let alive = true;
    let handle: EditorHandle | null = null;
    import('../../../lib/codemirror').then(async ({ createEditor }) => {
      if (!alive || !host.current) return;
      handle = await createEditor(host.current, {
        doc: html,
        path: 'page.html',
        dark: isDark(),
        wrap: true,
        phone: matchMedia('(pointer: coarse)').matches,
        onChange: (d) => cb.current.onChange(d),
        onSave: () => cb.current.onSave(),
      });
      if (!alive) handle.destroy();
    });
    const mo = new MutationObserver(() => handle?.setDark(isDark()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      alive = false;
      mo.disconnect();
      handle?.destroy();
    };
    // The editor keeps its own text from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={host} className={cx('min-h-0 overflow-hidden [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-[12.5px]', className)} />;
}

/** The HTML coming in, as the agent writes it, kept at its end. */
function StreamCode({ text }: { text: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [text]);
  return (
    <pre
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        follow.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
      }}
      translate="no"
      className="h-full overflow-auto bg-bg px-4 py-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-fg-2"
    >
      {text}
      <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent align-middle" />
    </pre>
  );
}

const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB`);

export function Studio({
  doc,
  draft,
  layout,
  readOnly,
  onSave,
  onPick,
  lead,
  tail,
  band,
  saveLabel = 'Save',
  savedNote,
  onDirty,
  initialMode,
}: {
  doc: StudioDoc | null;
  /** An agent is writing it: what came so far. */
  draft?: { text: string; done: boolean } | null;
  layout: 'panel' | 'page' | 'sheet';
  readOnly?: boolean;
  /** Saves the HTML; false when it did not. */
  onSave?: (html: string) => Promise<boolean>;
  onPick?: (p: Pick) => void;
  /** The bar's start (a title, a way back) and end (the container's own buttons). */
  lead?: ReactNode;
  tail?: ReactNode;
  /** Under the bar: an older version on view, say. */
  band?: ReactNode;
  saveLabel?: string;
  /** Under the save bar: who hears of the change. */
  savedNote?: string;
  /** Told whether there are changes not saved. */
  onDirty?: (dirty: boolean) => void;
  /** How it opens: Edit for a blank page just made, say. */
  initialMode?: StudioMode;
}) {
  const [mode, setMode] = useState<StudioMode>(initialMode ?? 'view');
  const [device, setDevice] = useState<Device>(() => (localStorage.getItem(DEVICE_KEY) as Device) || 'desktop');
  // Changed HTML not saved yet (from Code, or the editor's when it was left); null: the page as it is.
  const [pending, setPending] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeView, setCodeView] = useState(0);
  const [ed, setEd] = useState<EdState>({ dirty: false, canUndo: false, canRedo: false });
  const [sel, setSel] = useState<EdSel | null>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [epoch, setEpoch] = useState(0);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [streamCode, setStreamCode] = useState(false);
  const editRef = useRef<EditHandle>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const deviceRef = useRef<HTMLButtonElement>(null);
  const [deviceMenu, setDeviceMenu] = useState(false);
  // Room for the three screen sizes as buttons; else one button with a menu.
  const roomy = useMediaQuery('(min-width: 1180px)');
  const labels = useMemo(() => editorLabels(), []);
  const [confirm, confirmNode] = useConfirm();
  const writing = !!draft && !draft.done;
  const html = pending ?? doc?.html ?? '';
  const dirty = (pending !== null && pending !== doc?.html) || (mode === 'edit' && ed.dirty) || (mode === 'code' && code !== (pending ?? doc?.html ?? ''));
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => onDirty?.(dirty), [dirty]);

  // Another page (or the agent saved a new version while nothing was changed): start from it.
  const docKey = doc?.key;
  const savedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!doc) return;
    if (savedRef.current !== null && savedRef.current === doc.html) {
      savedRef.current = null;
      return;
    }
    if (dirtyRef.current) return;
    setPending(null);
    setEpoch((e) => e + 1);
    if (mode === 'code') {
      setCode(doc.html);
      setCodeView((v) => v + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);
  useEffect(() => localStorage.setItem(DEVICE_KEY, device), [device]);

  /** What is being changed now, as HTML. */
  const current = async (): Promise<string> => {
    if (mode === 'edit' && editRef.current) return editRef.current.html();
    if (mode === 'code') return code;
    return html;
  };

  const switchTo = async (m: StudioMode) => {
    if (m === mode || !doc) return;
    try {
      // Nothing changed in the editor: the page as written (the editor gives back the same page, but laid out its own way).
      const h = mode === 'edit' && !ed.dirty ? html : await current();
      if (h !== doc.html) setPending(h);
      if (m === 'code') {
        setCode(h);
        setCodeView((v) => v + 1);
      }
      setSel(null);
      setMode(m);
    } catch (e) {
      toastError(e);
    }
  };

  const save = async () => {
    if (!doc || !onSave || saving) return;
    setSaving(true);
    try {
      const h = await current();
      savedRef.current = h;
      if (await onSave(h)) {
        setPending(null);
        if (mode === 'code') setCode(h);
        editRef.current?.saved();
        setEd((s) => ({ ...s, dirty: false }));
      } else savedRef.current = null;
    } catch (e) {
      savedRef.current = null;
      toastError(e);
    } finally {
      setSaving(false);
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  const discard = async () => {
    if (!(await confirm({ title: 'Discard your changes?', body: 'The page goes back to how it was saved.', confirm: 'Discard', danger: true }))) return;
    setPending(null);
    setCode(doc?.html ?? '');
    setCodeView((v) => v + 1);
    setEd({ dirty: false, canUndo: false, canRedo: false });
    setSel(null);
    setEpoch((e) => e + 1);
  };

  // Typing in Code shows in the page a moment later.
  const [shown, setShown] = useState<{ html: string; n: number } | null>(null);
  useEffect(() => {
    if (mode !== 'code') return setShown(null);
    const t = window.setTimeout(() => setShown((s) => (s?.html === code ? s : { html: code, n: (s?.n ?? 0) + 1 })), 600);
    return () => window.clearTimeout(t);
  }, [code, mode]);

  const cmd = (c: string, arg?: unknown) => editRef.current?.cmd(c, arg);
  const side = layout === 'page';

  let body: ReactNode;
  if (writing || (!doc && draft)) {
    body = streamCode ? (
      <StreamCode text={draft!.text} />
    ) : (
      <DeviceStage device={device}>
        <StreamFrame html={draft!.text} base={doc?.base} />
      </DeviceStage>
    );
  } else if (!doc) {
    body = (
      <div className="flex h-full items-center justify-center text-fg-3">
        <Throbber size={28} />
      </div>
    );
  } else if (mode === 'edit') {
    body = (
      <div className={cx('flex h-full min-h-0', side ? 'flex-row' : 'flex-col')}>
        <div className="relative min-h-0 min-w-0 flex-1">
          <DeviceStage device={device}>
            <EditFrame
              key={epoch}
              ref={editRef}
              html={html}
              base={doc.base}
              title={doc.title}
              labels={labels}
              onSel={setSel}
              onState={setEd}
              onPalette={setPalette}
              onSave={() => void saveRef.current()}
            />
          </DeviceStage>
        </div>
        <aside className={cx('flex min-h-0 shrink-0 flex-col bg-panel', side ? 'w-[300px] border-l border-line' : 'h-[42%] max-h-[340px] min-h-[180px] border-t border-line')}>
          <div className="flex min-h-9 shrink-0 items-center gap-1 overflow-x-auto px-2 pt-1.5 [&::-webkit-scrollbar]:hidden">
            {(sel?.crumbs ?? []).slice(-4).map((c, i, all) => (
              <span key={c.path.join('.')} className="flex shrink-0 items-center gap-1">
                {i > 0 && <span className="text-fg-3">›</span>}
                <button
                  type="button"
                  onClick={() => cmd('select', c.path)}
                  className={cx('rounded-md px-1.5 py-0.5 text-[12px] transition-colors hover:bg-bg-2', i === all.length - 1 ? 'font-semibold text-fg' : 'text-fg-3')}
                >
                  {c.name}
                </button>
              </span>
            ))}
            {!sel && <span className="px-1.5 text-[12px] font-semibold text-fg-2">Nothing picked</span>}
          </div>
          <Inspector sel={sel} palette={palette} cmd={cmd} onError={toastError} className="flex-1" />
        </aside>
      </div>
    );
  } else if (mode === 'code') {
    body = (
      <div className={cx('flex h-full min-h-0', side ? 'flex-row' : 'flex-col')}>
        <CodePane key={`${epoch}:${codeView}`} html={code} onChange={setCode} onSave={() => void saveRef.current()} className={cx('min-h-0 flex-1 bg-bg', side ? 'border-r border-line' : 'border-b border-line')} />
        <div className={cx('relative min-h-0', side ? 'flex-1' : 'h-[45%]')}>
          <DeviceStage device={device}>
            <PageFrame key={`${doc.key}:code:${shown?.n ?? 0}`} html={withBase(shown?.html ?? code, doc.base)} title={doc.title} store={doc.store} />
          </DeviceStage>
        </div>
      </div>
    );
  } else {
    body = (
      <DeviceStage device={device}>
        <PageFrame key={`${doc.key}:${epoch}:${pending === null ? 'saved' : pending.length}`} html={withBase(html, doc.base)} title={doc.title} store={doc.store} onPick={onPick} />
      </DeviceStage>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex min-h-12 shrink-0 items-center gap-1.5 border-b border-line px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">{lead}</div>
        {writing && layout !== 'panel' ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-fg-3">
            <span className="breathe h-1.5 w-1.5 rounded-full bg-busy" />
            Writing · {kb(new Blob([draft!.text]).size)}
          </span>
        ) : null}
        {writing ? (
          <Segmented
            size="sm"
            value={streamCode ? 'code' : 'view'}
            onChange={(v) => setStreamCode(v === 'code')}
            options={[
              { value: 'view', label: <Eye size={14} aria-label="The page" /> },
              { value: 'code', label: <Code2 size={14} aria-label="Its code" /> },
            ]}
          />
        ) : (
          doc &&
          !readOnly && (
            <Segmented
              size="sm"
              value={mode}
              onChange={(m) => void switchTo(m)}
              options={[
                { value: 'view', label: layout === 'page' ? 'Use' : <Eye size={14} aria-label="Use the page" /> },
                { value: 'edit', label: layout === 'page' ? 'Edit' : <PenLine size={14} aria-label="Edit" /> },
                { value: 'code', label: layout === 'page' ? 'Code' : <Code2 size={14} aria-label="Code" /> },
              ]}
            />
          )
        )}
        {layout === 'page' && roomy && (
          <Segmented size="sm" value={device} onChange={setDevice} options={DEVICES.map((d) => ({ value: d.value, label: <span title={d.label}>{d.icon}</span> }))} />
        )}
        {(layout === 'panel' || (layout === 'page' && !roomy)) && (
          <>
            <IconButton ref={deviceRef} label={`As on a ${DEVICES.find((d) => d.value === device)!.label.toLowerCase()}`} size="sm" active={deviceMenu} onClick={() => setDeviceMenu((o) => !o)}>
              {DEVICES.find((d) => d.value === device)!.icon}
            </IconButton>
            <Popover anchor={deviceRef} open={deviceMenu} onClose={() => setDeviceMenu(false)} align="end" width={170}>
              {DEVICES.map((d) => (
                <MenuItem key={d.value} icon={d.icon} onClick={() => (setDevice(d.value), setDeviceMenu(false))}>
                  <span className={cx(device === d.value && 'font-semibold text-fg')}>{d.label}</span>
                </MenuItem>
              ))}
            </Popover>
          </>
        )}
        {tail}
      </div>
      {band}
      {mode === 'edit' && doc && !writing && (
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
          <Button ref={addRef} size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setAdding((a) => !a)}>
            Add
          </Button>
          <IconButton label="Undo (Ctrl+Z)" size="sm" disabled={!ed.canUndo} onClick={() => cmd('undo')}>
            <Undo2 size={14} />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" size="sm" disabled={!ed.canRedo} onClick={() => cmd('redo')}>
            <Redo2 size={14} />
          </IconButton>
          <span className="ml-1 truncate text-[12px] text-fg-3">{sel ? (sel.wordy ? 'Click it again to change its words' : 'Drag the handle to move it') : 'Click a part of the page'}</span>
          <Popover anchor={addRef} open={adding} onClose={() => setAdding(false)} width={252}>
            <div className="grid grid-cols-2 gap-1 p-1">
              {BLOCKS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    cmd('insert', { html: b.html, edit: b.edit });
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-left text-[13px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg"
                >
                  {b.label}
                </button>
              ))}
            </div>
            <div className="border-t border-line px-2.5 py-1.5 text-[11.5px] text-fg-3">After the part picked, or at the end</div>
          </Popover>
        </div>
      )}
      <div className="relative min-h-0 flex-1">{body}</div>
      {dirty && !writing && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-panel px-3 py-2 pb-[max(8px,var(--safe-bottom))]">
          <span className="min-w-0 flex-1 text-[12.5px] text-fg-2">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-warn align-middle" />
            Not saved yet{savedNote ? <span className="text-fg-3"> · {savedNote}</span> : null}
          </span>
          <Button size="sm" variant="ghost" onClick={discard} disabled={saving}>
            Discard
          </Button>
          <Button size="sm" variant="primary" onClick={() => void save()} disabled={saving || !onSave}>
            {saving ? 'Saving…' : saveLabel}
          </Button>
        </div>
      )}
      {confirmNode}
    </div>
  );
}
