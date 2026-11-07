// The picture editor, in a tab of its own (host.tsx), laid out as Photoshop, Affinity Photo and Pixelmator lay theirs
// out (the editors' shell): menus (File, Edit, Image, Layer, Select, Filter, View, AI) with Undo, Redo, Hold to compare
// and Save at the top; the tool's options under them; the tools down the left (the colours at their foot); the picture
// in the middle; the panels on the right (Histogram and Colour; Adjustments, Properties and AI; Layers and History); and a
// status bar (the zoom, the picture's size, the pointer's place and the colour under it, how it will be saved). On a
// phone it fills the screen: the menus under one button, the tools along the bottom, the panels in a sheet.
// The picture is a stack of layers (picture/doc.ts) edited by the engine (picture/editor.ts); Save puts them together
// into one picture of the size and kind of file picked, and keeps it where it came from (or in the Library).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Layers as LayersIcon, Redo2, SplitSquareHorizontal, Undo2 } from 'lucide-react';
import { formatOfMime, formatOfName, type ImageFormat, type Saved } from '@shared/mediaedit';
import { Button, Empty, IconButton, Popover, Throbber, useIsMobile } from '../../components/ui';
import { toast, toastError } from '../../lib/store';
import { keepKeys, type EditorProps } from './host';
import { AiTools } from './picture/AiTools';
import { viaLink } from '../../lib/machine';
import { AdjustPanel } from './picture/adjust';
import { AmountDialog, CanvasSizeDialog, ImageSizeDialog, LibraryPicker, SaveOptions } from './picture/dialogs';
import { canvasOf, Pixels, rasterLayer, shrinkTo, type Doc, type RasterLayer } from './picture/doc';
import { canvasOfFile, PictureEd } from './picture/editor';
import { polyClose } from './picture/interact';
import type { Mask } from './picture/mask';
import { buildMenus, MORE_KEYS } from './picture/menus';
import { ColourPanel, HistogramPanel, HistoryPanel, LayersPanel, PropertiesPanel } from './picture/panels';
import { ALL_TOOLS, TOOL_GROUPS, ToolOptions, toolForKey } from './picture/tools';
import { useEd, View } from './picture/View';
import { blobData, loadSource } from './render';
import { saveImage, savePlans } from './save';
import { erase as eraseRoute, localState } from '../images/studio/api';
import { readKept } from './ai';
import { ColorSwatches, Dock, EditorShell, isMod, MenuBar, PanelSheet, runMenuKeys, shortcutGroups, ShortcutsDialog, StatusBar, StatusItem, ToolRail, useRailPicks, type DockPanel } from './shell';
import type { ToolId } from './picture/editor';

interface Start {
  doc: Doc;
  original: HTMLCanvasElement;
  mime: string;
  note?: string;
}

async function startOf(src: string): Promise<Start> {
  const s = await loadSource(src);
  const px = new Pixels(s.canvas);
  const bg = rasterLayer('Background', px);
  const k = Math.min(1, 2048 / Math.max(s.w, s.h));
  return { doc: { w: s.w, h: s.h, layers: [bg], active: bg.id, sel: null }, original: k < 1 ? shrinkTo(s.canvas, k) : (() => {
      const c = canvasOf(s.w, s.h);
      c.getContext('2d')!.drawImage(s.canvas, 0, 0);
      return c;
    })(), mime: s.mime, note: s.note };
}

export function ImageEditor(p: EditorProps) {
  const [start, setStart] = useState<Start | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setStart(null);
    setError(null);
    startOf(p.o.src).then(
      (s) => alive && setStart(s),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [p.o.src]);
  if (!start)
    return (
      <div className="flex h-full min-h-0 flex-col bg-bg">
        {p.lead && <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-1.5 pt-[var(--safe-top)]">{p.lead}</div>}
        <div className="flex min-h-0 flex-1 items-center justify-center text-fg-3">
          {error ? (
            <Empty title="That picture could not be opened">
              <span>{error}</span>
              <span className="mt-3 block">
                <Button size="sm" variant="secondary" onClick={p.close}>
                  Close
                </Button>
              </span>
            </Empty>
          ) : (
            <Throbber size={28} />
          )}
        </div>
      </div>
    );
  return <Editing {...p} start={start} />;
}

const PANELS = { histogram: 'Histogram', colour: 'Colour', adjust: 'Adjustments', properties: 'Properties', ai: 'AI', layers: 'Layers', history: 'History' } as const;

function Editing({ o, active, detached, setDirty, done, lead, close, start }: EditorProps & { start: Start }) {
  const phone = useIsMobile();
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const r = () => setWidth(el.clientWidth);
    r();
    const ro = new ResizeObserver(r);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const mobile = phone || (width > 0 && width < 720);
  const ed = useMemo(() => new PictureEd(start.doc, start.original, (t, err) => (err ? toastError(new Error(t)) : toast(t))), [start]);
  useEd(ed);
  const [picks, setPicks] = useRailPicks('picture');

  // ---- saving ----
  const fileTo = o.to && 'file' in o.to ? o.to.file : null;
  const own = (fileTo ? formatOfName(fileTo) : null) ?? formatOfMime(start.mime);
  const [format, setFormat] = useState<ImageFormat>(own ?? 'png');
  const [quality, setQuality] = useState(90);
  const [outW, setOutW] = useState<number | null>(null);
  const [saving, setSaving] = useState<'main' | 'copy' | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const saveRef = useRef<HTMLButtonElement>(null);
  const plans = savePlans(o, detached, format);
  const savedStep = useRef(ed.hist.steps[0]);
  const dirty = ed.hist.steps[ed.hist.at] !== savedStep.current;
  useEffect(() => setDirty(dirty), [dirty, setDirty]);
  const full = { w: ed.doc.w, h: ed.doc.h };
  const outH = outW ? Math.max(1, Math.round((outW * full.h) / full.w)) : full.h;
  // A picture with see-through parts is not saved as a JPEG unasked: it would turn white.
  const save = async (which: 'main' | 'copy') => {
    const plan = which === 'main' ? plans.main : plans.copy;
    if (!plan || saving) return;
    ed.endSessions(true);
    setSaving(which);
    try {
      await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
      const made = await ed.file(format, quality, outW && outW !== full.w ? { w: outW, h: outH } : undefined);
      const ans = await saveImage({ data: made.data, to: plan.to, ...(made.made !== format ? { format, quality } : {}) });
      savedStep.current = ed.hist.steps[ed.hist.at];
      ed.emit(false);
      if (ans.note) toast(ans.note);
      const result: Saved = { kind: 'image', src: ans.src, media: ans.media, path: ans.path, w: ans.w, h: ans.h, mime: ans.mime, replaced: ans.replaced, ...('asset' in plan.to ? { data: made.data } : {}) };
      if (which === 'copy') toast(ans.path ? `Saved a copy beside it: ${ans.path.split(/[\\/]/).pop()}` : 'Saved a copy in your Library', 'ok');
      else await done(result);
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(null);
    }
  };
  const exportAs = async (f: ImageFormat) => {
    try {
      const made = await ed.file(f, quality);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(made.blob);
      a.download = `${(o.title || 'picture').replace(/\.[a-z0-9]+$/i, '')}.${f === 'jpeg' ? 'jpg' : f}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) {
      toastError(e);
    }
  };

  // ---- adding pictures ----
  const fileInput = useRef<HTMLInputElement>(null);
  const addFiles = async (files: File[]) => {
    for (const f of files.filter((x) => x.type.startsWith('image/'))) {
      try {
        ed.addPicture(await canvasOfFile(f), f.name);
      } catch (e) {
        toastError(e);
      }
    }
  };
  const fromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const t = it.types.find((x) => x.startsWith('image/'));
        if (t) return ed.addPicture(await canvasOfFile(await it.getType(t)), 'Pasted');
      }
      if (ed.clip) return ed.pasteHere();
      toast('There is no picture in the clipboard.');
    } catch {
      // The browser keeps the clipboard to itself: Ctrl+V still works.
      if (ed.clip) ed.pasteHere();
      else toast('Press Ctrl+V to paste a picture into the editor.');
    }
  };
  const [library, setLibrary] = useState(false);

  // ---- dialogs ----
  const [dialog, setDialog] = useState<'size' | 'canvas' | 'keys' | null>(null);
  const [amount, setAmount] = useState<Parameters<typeof AmountDialog>[0]['ask']>(null);
  const askAmount = (kind: 'feather' | 'grow' | 'shrink' | 'stroke') => {
    const long = Math.max(ed.doc.w, ed.doc.h);
    const def = Math.max(1, Math.round(long / 200));
    if (kind === 'feather') setAmount({ title: 'Feather', label: 'Soft edge', value: def * 2, max: 500, run: (v) => ed.featherSelection(v) });
    if (kind === 'grow') setAmount({ title: 'Grow the selection', label: 'By', value: def, max: 500, run: (v) => ed.growSelection(v) });
    if (kind === 'shrink') setAmount({ title: 'Shrink the selection', label: 'By', value: def, max: 500, run: (v) => ed.shrinkSelection(v) });
    if (kind === 'stroke') setAmount({ title: 'Stroke the selection', label: 'Width', value: def, max: 200, run: (v) => ed.strokeSelection(v, ed.fg), extra: <p className="text-[12px] text-fg-3">In the foreground colour, on the picked layer.</p> });
  };
  const backToOriginal = async () => {
    try {
      const s = await startOf(o.src);
      ed.change('Back to the original', s.doc, true, { bytes: s.doc.w * s.doc.h * 4 });
    } catch (e) {
      toastError(e);
    }
  };

  // A larger area to heal: the eraser on this computer when it is set up, else filled here.
  const bigHeal = useCallback(
    (layer: RasterLayer, hole: Mask) => {
      void (async () => {
        try {
          const st = await localState();
          if (!st.ready) return ed.healHere(layer, hole);
          ed.busy = 'Healing';
          ed.emit(false);
          const m = Math.round(Math.max(hole.w, hole.h) * 0.8) + 16;
          const r = { x: Math.max(0, hole.x - layer.x - m), y: Math.max(0, hole.y - layer.y - m), w: 0, h: 0 };
          r.w = Math.min(layer.px.w, hole.x - layer.x + hole.w + m) - r.x;
          r.h = Math.min(layer.px.h, hole.y - layer.y + hole.h + m) - r.y;
          const part = canvasOf(r.w, r.h);
          part.getContext('2d')!.drawImage(layer.px.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
          const mask = canvasOf(r.w, r.h);
          const mg = mask.getContext('2d')!;
          mg.fillStyle = '#000';
          mg.fillRect(0, 0, r.w, r.h);
          const md = mg.getImageData(0, 0, r.w, r.h);
          for (let y = 0; y < hole.h; y++)
            for (let x = 0; x < hole.w; x++) {
              const v = hole.data[y * hole.w + x];
              const X = x + hole.x - layer.x - r.x;
              const Y = y + hole.y - layer.y - r.y;
              if (!v || X < 0 || Y < 0 || X >= r.w || Y >= r.h) continue;
              const i = (Y * r.w + X) * 4;
              md.data[i] = md.data[i + 1] = md.data[i + 2] = v;
            }
          mg.putImageData(md, 0, 0);
          const ans = await eraseRoute({ src: await blobData(await new Promise<Blob>((ok) => part.toBlob((b) => ok(b!), 'image/png'))), mask: mask.toDataURL('image/png'), how: 'local' });
          const got = await readKept(ans.src);
          ed.putRegion(layer, r.x, r.y, got.width === r.w && got.height === r.h ? got : (() => {
              const c = canvasOf(r.w, r.h);
              c.getContext('2d')!.drawImage(got, 0, 0, r.w, r.h);
              return c;
            })(), 'Spot healing');
        } catch (e) {
          ed.healHere(layer, hole);
          if (!/not set up/.test((e as Error).message)) toastError(e);
        } finally {
          ed.busy = null;
          ed.emit(false);
        }
      })();
    },
    [ed],
  );

  // ---- menus and keys ----
  const menus = buildMenus(ed, {
    openFile: () => fileInput.current?.click(),
    openLibrary: () => !viaLink && setLibrary(true),
    fromClipboard: () => void fromClipboard(),
    save: (w) => void save(w),
    saveOptions: () => setSaveOpen(true),
    canCopy: !!plans.copy,
    saveLabel: plans.main.label,
    copyLabel: plans.copy?.label ?? null,
    exportAs: (f) => void exportAs(f),
    backToOriginal: () => void backToOriginal(),
    close,
    imageSize: () => setDialog('size'),
    canvasSize: () => setDialog('canvas'),
    amount: askAmount,
    shortcuts: () => setDialog('keys'),
    adjust: (s) => ed.openAdjust(s),
  });
  useEffect(() => {
    if (!active) return;
    const el = root.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, [active]);
  // Keys pressed with nothing focused (after words were written, a dialog closed, a panel's field left) are the editor's.
  const keyRef = useRef<(e: React.KeyboardEvent) => void>(() => {});
  useEffect(() => {
    if (!active) return;
    const k = (e: KeyboardEvent) => {
      if (e.target !== document.body || document.querySelector('[role=dialog]')) return;
      root.current?.focus({ preventScroll: true });
      keyRef.current(e as unknown as React.KeyboardEvent);
    };
    // Heard as it starts down: the tabs' host keeps such keys from the page under the editor.
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [active]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const typing = !!(e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable="true"]');
    const mod = isMod(e);
    const k = e.key;
    if (typing) {
      if (mod && k.toLowerCase() === 's') {
        e.preventDefault();
        void save('main');
      }
      return keepKeys(e);
    }
    // Paste: the browser's own paste event brings what is copied (a picture from elsewhere too).
    if (mod && !e.shiftKey && k.toLowerCase() === 'v') return keepKeys(e);
    if (k === 'Enter') {
      if (ed.crop) (ed.commitCrop(), ed.setTool('move'));
      else if (ed.xform) ed.commitTransform();
      else if (ed.overlay.poly) polyClose(ed);
      e.preventDefault();
      return keepKeys(e);
    }
    if (k === 'Escape') {
      if (ed.crop) (ed.cancelCrop(), ed.setTool('move'));
      else if (ed.xform) ed.cancelTransform();
      else if (ed.overlay.poly) ((ed.overlay = { ...ed.overlay, poly: undefined }), ed.emit(false));
      else if (ed.aiStrokes.length) ((ed.aiStrokes = []), ed.emit(false));
      return keepKeys(e);
    }
    if (runMenuKeys(menus, e)) return keepKeys(e);
    if (!mod && !e.altKey) {
      if (k === '[' || k === ']' || e.code === 'BracketLeft' || e.code === 'BracketRight') {
        e.preventDefault();
        ed.brushStep(e.code === 'BracketRight' || k === ']' ? 1 : -1);
        return keepKeys(e);
      }
      if (k.toLowerCase() === 'x' && !e.shiftKey) {
        ed.swapColors();
        return keepKeys(e);
      }
      if (k.toLowerCase() === 'd' && !e.shiftKey) {
        ed.resetColors();
        return keepKeys(e);
      }
      if (k.startsWith('Arrow') && ed.doc.active) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0;
        const dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
        if (ed.xform) ed.setTransform({ tx: ed.xform.tx + dx, ty: ed.xform.ty + dy });
        else ed.moveLayerBy(ed.doc, ed.doc.active, dx, dy, true);
        return keepKeys(e);
      }
      if (k.length === 1 && /[a-z]/i.test(k) && !e.shiftKey) {
        const t = toolForKey(k, ed.tool);
        if (t) {
          e.preventDefault();
          ed.setTool(t);
          return keepKeys(e);
        }
      }
    }
    keepKeys(e);
  };
  keyRef.current = onKeyDown;

  // ---- panels ----
  const panels: DockPanel[] = [
    { id: 'histogram', label: PANELS.histogram, render: () => <HistogramPanel ed={ed} /> },
    { id: 'colour', label: PANELS.colour, render: () => <ColourPanel ed={ed} /> },
    { id: 'adjust', label: PANELS.adjust, render: () => <AdjustPanel ed={ed} /> },
    { id: 'properties', label: PANELS.properties, render: () => <PropertiesPanel ed={ed} /> },
    { id: 'ai', label: PANELS.ai, render: () => <AiTools ed={ed} /> },
    { id: 'layers', label: PANELS.layers, render: () => <LayersPanel ed={ed} onAddPicture={(from) => (from === 'device' ? fileInput.current?.click() : from === 'library' ? setLibrary(true) : void fromClipboard())} /> },
    { id: 'history', label: PANELS.history, render: () => <HistoryPanel ed={ed} /> },
    // At someone's link, no AI tools (they spend the owner's money or their computer's time).
  ].filter((x) => !viaLink || x.id !== 'ai');
  const [sheet, setSheet] = useState<string | null>(null);
  useEffect(() => {
    if (mobile && ed.focus) setSheet(ed.focus.panel);
  }, [ed.focus?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the frame ----
  const [cursor, setCursor] = useState<{ p: [number, number] | null; c: string | null }>({ p: null, c: null });
  const busy = !!saving || !!ed.busy;
  const undoRedo = (
    <>
      <IconButton label="Undo (Ctrl+Z)" disabled={!ed.hist.canUndo || busy} onClick={() => ed.undo()}>
        <Undo2 size={17} />
      </IconButton>
      <IconButton label="Redo (Ctrl+Shift+Z)" disabled={!ed.hist.canRedo || busy} onClick={() => ed.redo()}>
        <Redo2 size={17} />
      </IconButton>
      {!mobile && (
        <IconButton
          label="Hold to compare with the original"
          active={ed.comparing}
          disabled={busy}
          onPointerDown={(e) => {
            e.preventDefault();
            ed.comparing = true;
            ed.emit(false);
          }}
          onPointerUp={() => ((ed.comparing = false), ed.emit(false))}
          onPointerLeave={() => ed.comparing && ((ed.comparing = false), ed.emit(false))}
          onPointerCancel={() => ((ed.comparing = false), ed.emit(false))}
        >
          <SplitSquareHorizontal size={17} />
        </IconButton>
      )}
    </>
  );
  const saveButton = (
    <div className="ml-1 flex shrink-0">
      <Button size="sm" variant="primary" className="rounded-r-none pr-2.5" disabled={busy} onClick={() => void save('main')}>
        {saving === 'main' ? 'Saving' : plans.main.label}
      </Button>
      <button ref={saveRef} type="button" disabled={busy} onClick={() => setSaveOpen((x) => !x)} aria-label="How it is saved" title="How it is saved" className="flex h-8 items-center rounded-r-[10px] border-l border-black/15 bg-accent px-1.5 text-accent-fg transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-45">
        <ChevronDown size={14} />
      </button>
      <Popover anchor={saveRef} open={saveOpen} onClose={() => setSaveOpen(false)} align="end" width={320} title="How it is saved" className="p-3">
        <SaveOptions w={outW ?? full.w} h={outH} full={full} onWidth={setOutW} format={format} onFormat={setFormat} quality={quality} onQuality={setQuality} says={[plans.main.says, plans.copy?.says].filter(Boolean).join(' ')} copy={mobile && plans.copy ? { label: plans.copy.label, run: () => void save('copy') } : null} busy={busy} />
      </Popover>
    </div>
  );
  const top: ReactNode = mobile ? (
    <>
      {lead}
      <span translate="no" className="min-w-0 flex-1 truncate px-1 text-[14px] font-semibold">
        {o.title}
      </span>
      <MenuBar menus={menus} compact />
      {undoRedo}
      {saveButton}
    </>
  ) : (
    <>
      {lead}
      <MenuBar menus={menus} compact="auto" />
      <span className="min-w-2 flex-1" />
      {undoRedo}
      {plans.copy && (
        <Button size="sm" variant="secondary" className="ml-1" disabled={busy} onClick={() => void save('copy')}>
          {saving === 'copy' ? 'Saving' : plans.copy.label}
        </Button>
      )}
      {saveButton}
    </>
  );
  const swatches = <ColorSwatches fg={ed.fg} bg={ed.bg} onFg={(c, d) => ed.setFg(c, d)} onBg={(c, d) => ed.setBg(c, d)} onSwap={() => ed.swapColors()} onReset={() => ed.resetColors()} swatches={ed.recent} />;
  const tool = ALL_TOOLS.find((t) => t.id === ed.tool);
  const kind = format === 'jpeg' ? 'JPEG' : format === 'webp' ? 'WebP' : 'PNG';
  const [zoomZ, setZoomZ] = useState(1);
  const zoom = Math.round(zoomZ * 100);
  const status = (
    <StatusBar>
      <StatusItem title="Fit on screen" onClick={() => ed.view?.fit()}>
        {zoom}%
      </StatusItem>
      <StatusItem title="The picture's size">
        {ed.doc.w} × {ed.doc.h} px
      </StatusItem>
      <StatusItem title="Layers">
        <LayersIcon size={12} />
        {ed.doc.layers.length}
      </StatusItem>
      <StatusItem title="Where the pointer is, and the colour under it" className="min-w-[9rem]">
        {cursor.p ? (
          <>
            <span>
              {cursor.p[0]}, {cursor.p[1]}
            </span>
            {cursor.c && (
              <>
                <span className="h-3 w-3 rounded-sm border border-line-2" style={{ background: cursor.c }} />
                <span className="font-mono">{cursor.c}</span>
              </>
            )}
          </>
        ) : null}
      </StatusItem>
      {tool && <StatusItem>{tool.label}</StatusItem>}
      {ed.busy && (
        <StatusItem>
          <Throbber /> {ed.busy}
        </StatusItem>
      )}
      <span className="flex-1" />
      <StatusItem title="How it is saved" onClick={() => setSaveOpen(true)}>
        {`${kind}, ${outW && outW !== full.w ? `${outW} × ${outH}` : 'full size'}: ${plans.main.label}`}
      </StatusItem>
    </StatusBar>
  );
  const stage = (
    <>
      <View ed={ed} className="absolute inset-0" onCursor={(p, c) => setCursor({ p, c })} onZoom={setZoomZ} bigHeal={bigHeal} />
      {start.note && <p className="pointer-events-none absolute top-2 left-1/2 max-w-[80%] -translate-x-1/2 rounded-lg bg-black/65 px-2.5 py-1 text-center text-[12px] text-white">{start.note}</p>}
    </>
  );
  return (
    <div
      ref={root}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPaste={(e) => {
        if ((e.target as HTMLElement).closest?.('input, textarea')) return;
        const f = [...(e.clipboardData?.files ?? [])].filter((x) => x.type.startsWith('image/'));
        e.preventDefault();
        if (f.length) void addFiles(f);
        else ed.pasteHere();
      }}
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        const f = [...e.dataTransfer.files];
        if (!f.length) return;
        e.preventDefault();
        void addFiles(f);
      }}
      onPointerDown={(e) => {
        const el = root.current;
        if (el && !(e.target as HTMLElement).closest('input, textarea, select, button, [contenteditable="true"]') && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
      }}
      className="h-full min-h-0 outline-none"
    >
      <EditorShell
        mobile={mobile}
        top={top}
        options={<ToolOptions ed={ed} mobile={mobile} />}
        rail={<ToolRail groups={TOOL_GROUPS} active={ed.tool} onPick={(t) => ed.setTool(t as ToolId)} picks={picks} setPicks={setPicks} foot={swatches} />}
        stage={stage}
        dock={<Dock id="picture" panels={panels} groups={[['histogram', 'colour'], ['adjust', 'properties', 'ai'], ['layers', 'history']]} focus={ed.focus} defaultWeights={[0.9, 2.2, 1.7]} defaultFolded={{ 0: true }} />}
        status={status}
        phoneTools={
          <div className="flex items-center">
            <div className="min-w-0 flex-1">
              <ToolRail horizontal groups={TOOL_GROUPS} active={ed.tool} onPick={(t) => ed.setTool(t as ToolId)} picks={picks} setPicks={setPicks} />
            </div>
            <div className="flex shrink-0 items-center gap-1.5 border-l border-line pr-2 pl-1.5">
              {swatches}
              <Button size="sm" variant="secondary" icon={<LayersIcon size={14} />} onClick={() => setSheet(sheet ? null : 'layers')}>
                Panels
              </Button>
            </div>
          </div>
        }
        phoneSheet={sheet && <PanelSheet panels={panels} tab={sheet} onTab={setSheet} onClose={() => setSheet(null)} />}
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void addFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      <LibraryPicker
        open={library}
        onClose={() => setLibrary(false)}
        onPick={(url, title) =>
          void loadSource(url).then(
            (s) => ed.addPicture(s.canvas, title),
            (e: Error) => toastError(e),
          )
        }
      />
      <ImageSizeDialog open={dialog === 'size'} w={ed.doc.w} h={ed.doc.h} onClose={() => setDialog(null)} onApply={(w, h) => ed.imageSize(w, h)} />
      <CanvasSizeDialog open={dialog === 'canvas'} w={ed.doc.w} h={ed.doc.h} bg={ed.bg} onClose={() => setDialog(null)} onApply={(w, h, a, c) => ed.canvasSize(w, h, a, c)} />
      <AmountDialog ask={amount} onClose={() => setAmount(null)} />
      <ShortcutsDialog open={dialog === 'keys'} onClose={() => setDialog(null)} groups={shortcutGroups(menus, MORE_KEYS)} />
    </div>
  );
}
