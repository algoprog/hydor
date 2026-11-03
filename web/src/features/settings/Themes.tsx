// Settings → General → Theme: the mode (dark, light, or the device's), a theme for each, picked from
// cards that preview them, and an editor for themes of your own (every colour, with the whole app as
// the preview while you edit).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Download, Monitor, Moon, MoreHorizontal, Pencil, Plus, Sun, Trash2, TriangleAlert, X } from 'lucide-react';
import { BUILT_IN_THEMES, DEFAULT_THEME, THEME_TOKENS, cleanTheme, contrast, normalizeHex, themeColors, MAX_THEMES, type AppTheme, type ThemeBase, type ThemeColors, type ThemeToken } from '@shared/themes';
import { put } from '../../lib/api';
import { toast, toastError, useUI, type Theme } from '../../lib/store';
import { applyTheme, paintTheme, pickTheme, setCustomThemes, useThemes } from '../../lib/theme';
import { Button, cx, Dialog, IconButton, MenuItem, MenuSep, Popover, Section, Segmented, inputCls, useConfirm, useMediaQuery } from '../../components/ui';

/** A miniature of the app in a theme's colours: sidebar, a conversation, code and the composer. */
export function ThemeThumb({ theme, className }: { theme: AppTheme; className?: string }) {
  const c = themeColors(theme);
  const bar = (x: number, y: number, w: number, fill: string, h = 2.6) => <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} />;
  return (
    <svg viewBox="0 0 160 100" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <rect width="160" height="100" fill={c.bg} />
      <rect width="44" height="100" fill={c.sidebar} />
      <rect x="44" width="0.8" height="100" fill={c.line} />
      <rect x="6" y="7" width="7" height="7" rx="2" fill={c.accent} />
      {bar(16, 9.2, 19, c.fg)}
      <rect x="5.5" y="19" width="33" height="8.5" rx="2.6" fill={c.panel} stroke={c['line-2']} strokeWidth="0.6" />
      {bar(9.5, 22, 15, c['fg-2'])}
      <rect x="4" y="33" width="37" height="9.5" rx="2.6" fill={c['bg-3']} />
      <circle cx="9.5" cy="37.75" r="1.9" fill={c.busy} />
      {bar(14, 36.5, 22, c.fg)}
      <circle cx="9.5" cy="49" r="1.9" fill={c.warn} />
      {bar(14, 47.7, 18, c['fg-2'])}
      <circle cx="9.5" cy="59" r="1.9" fill={c.ok} />
      {bar(14, 57.7, 20, c['fg-3'])}
      {bar(14, 67.7, 16, c['fg-3'])}
      <circle cx="9.5" cy="69" r="1.9" fill={c.claude} />
      {bar(14, 77.7, 21, c['fg-3'])}
      <circle cx="9.5" cy="79" r="1.9" fill={c.codex} />
      {bar(52, 8, 42, c.fg, 3)}
      {bar(98, 8.2, 14, c['fg-3'])}
      <rect x="44.8" y="16" width="115.2" height="0.8" fill={c.line} />
      <rect x="100" y="22" width="52" height="11" rx="4" fill={c['bg-2']} />
      {bar(105, 26.2, 38, c.fg)}
      {bar(52, 39, 88, c.fg)}
      {bar(52, 44.5, 70, c['fg-2'])}
      <rect x="52" y="51" width="100" height="19" rx="3" fill={c['code-bg']} stroke={c.line} strokeWidth="0.6" />
      {bar(56, 55, 14, c.accent)}
      {bar(72, 55, 26, c['fg-2'])}
      {bar(56, 60, 34, c.ok)}
      {bar(56, 65, 26, c.err)}
      {bar(52, 74.5, 54, c['fg-3'])}
      <rect x="52" y="81" width="100" height="13" rx="4" fill={c.panel} stroke={c['line-2']} strokeWidth="0.6" />
      {bar(57, 86.2, 38, c['fg-3'])}
      <circle cx="145" cy="87.5" r="4" fill={c.accent} />
      <path d="M145 89.6V85.6M143.3 87.2L145 85.5L146.7 87.2" fill="none" stroke={c['accent-fg']} strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface Draft {
  /** null for a theme not saved yet. */
  id: string | null;
  name: string;
  base: ThemeBase;
  colors: ThemeColors;
}

const draftFrom = (t: AppTheme, copy: boolean): Draft => ({ id: copy ? null : t.id, name: copy ? `${t.name} copy` : t.name, base: t.base, colors: themeColors(t) });

function newId(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return `${slug || 'theme'}-${Math.random().toString(36).slice(2, 8)}`;
}

async function saveThemes(list: AppTheme[]) {
  const r = await put<{ themes: AppTheme[] }>('/api/themes', { themes: list });
  setCustomThemes(r.themes);
}

async function copyTheme(t: { name: string; base: ThemeBase; colors: Partial<ThemeColors> }) {
  try {
    await navigator.clipboard.writeText(JSON.stringify({ name: t.name, base: t.base, colors: t.colors }, null, 2));
    toast('Copied. Paste it into Import in another Hydor to add it there.', 'ok');
  } catch {
    toast('Could not reach the clipboard here', 'error');
  }
}

export function ThemeSettings() {
  const mode = useUI((s) => s.theme);
  const picks = { dark: useUI((s) => s.darkTheme), light: useUI((s) => s.lightTheme) };
  const custom = useThemes((s) => s.custom);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const showing: ThemeBase = mode === 'dark' || (mode === 'system' && systemDark) ? 'dark' : 'light';
  const all = [...BUILT_IN_THEMES, ...custom];
  const picked = (base: ThemeBase) => {
    const t = all.find((x) => x.id === picks[base] && x.base === base);
    return t?.id ?? DEFAULT_THEME[base];
  };
  const current = all.find((t) => t.id === picked(showing))!;

  const remove = async (t: AppTheme) => {
    if (!(await confirm({ title: `Delete ${t.name}?`, body: 'Devices using it go back to the Hydor theme.', confirm: 'Delete', danger: true }))) return;
    try {
      await saveThemes(custom.filter((x) => x.id !== t.id));
      const ui = useUI.getState();
      if (ui.darkTheme === t.id) ui.set({ darkTheme: DEFAULT_THEME.dark });
      if (ui.lightTheme === t.id) ui.set({ lightTheme: DEFAULT_THEME.light });
      applyTheme();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Section
      title="Theme"
      sub={mode === 'system' ? 'Follows your device: a dark theme at night, a light one by day' : 'Pick a theme, or make your own from any of them'}
      actions={
        <Segmented<Theme>
          size="sm"
          value={mode}
          onChange={(m) => {
            useUI.getState().set({ theme: m });
            applyTheme();
          }}
          options={[
            { value: 'dark', label: 'Dark', icon: <Moon size={13} /> },
            { value: 'light', label: 'Light', icon: <Sun size={13} /> },
            { value: 'system', label: 'System', icon: <Monitor size={13} /> },
          ]}
        />
      }
    >
      <div className="space-y-4">
        {/* Small cards, dark and light side by side where there is room; on phones two to a row. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:gap-x-8">
          {(['dark', 'light'] as const).map((base) => (
            <div key={base} className="min-w-0">
              <div className="mb-2 flex items-baseline gap-2 text-[12px]">
                <span className="font-medium text-fg-2">{base === 'dark' ? 'Dark' : 'Light'}</span>
                {mode === 'system' && <span className="text-fg-3">{base === showing ? 'showing now' : `when your device is ${base}`}</span>}
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
                {all
                  .filter((t) => t.base === base)
                  .map((t) => (
                    <ThemeCard
                      key={t.id}
                      theme={t}
                      picked={picked(base) === t.id}
                      showing={picked(base) === t.id && base === showing}
                      onPick={() => pickTheme(t)}
                      menu={(close) => (
                        <>
                          {custom.some((x) => x.id === t.id) && (
                            <MenuItem icon={<Pencil size={14} />} onClick={() => (close(), setDraft(draftFrom(t, false)))}>
                              Edit
                            </MenuItem>
                          )}
                          <MenuItem icon={<Plus size={14} />} onClick={() => (close(), setDraft(draftFrom(t, true)))}>
                            Make a copy to edit
                          </MenuItem>
                          <MenuItem icon={<Copy size={14} />} onClick={() => (close(), copyTheme({ ...t, colors: themeColors(t) }))}>
                            Copy to share
                          </MenuItem>
                          {custom.some((x) => x.id === t.id) && (
                            <>
                              <MenuSep />
                              <MenuItem icon={<Trash2 size={14} />} danger onClick={() => (close(), remove(t))}>
                                Delete
                              </MenuItem>
                            </>
                          )}
                        </>
                      )}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} disabled={custom.length >= MAX_THEMES} onClick={() => setDraft({ ...draftFrom(current, true), name: 'My theme' })}>
            New theme
          </Button>
          <Button size="sm" variant="ghost" icon={<Download size={14} />} disabled={custom.length >= MAX_THEMES} onClick={() => setImporting(true)}>
            Import
          </Button>
        </div>
      </div>
      {draft && <ThemeEditor key={draft.id ?? 'new'} start={draft} onClose={() => setDraft(null)} />}
      <ImportTheme open={importing} onClose={() => setImporting(false)} />
      {confirmNode}
    </Section>
  );
}

function ThemeCard({ theme, picked, showing, onPick, menu }: { theme: AppTheme; picked: boolean; showing: boolean; onPick: () => void; menu: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <div className={cx('group relative rounded-[11px] border p-1 transition-colors sm:w-[144px]', showing ? 'border-accent ring-2 ring-accent/25' : picked ? 'border-line-2' : 'border-line hover:border-line-2')}>
      <button type="button" onClick={onPick} aria-pressed={picked} className="block w-full text-left">
        <ThemeThumb theme={theme} className="block aspect-[16/10] w-full overflow-hidden rounded-[7px] ring-1 ring-line" />
        <span className="flex items-center gap-1 px-1 pt-1 pr-6">
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{theme.name}</span>
          {picked && <Check size={13} strokeWidth={2.5} className={showing ? 'shrink-0 text-accent' : 'shrink-0 text-fg-3'} />}
        </span>
      </button>
      <button
        ref={anchor}
        type="button"
        aria-label={`More for ${theme.name}`}
        title="More"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'absolute right-1 bottom-1 flex h-5.5 w-5.5 items-center justify-center rounded-md text-fg-3 transition-opacity hover:bg-bg-2 hover:text-fg',
          'opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100',
          open && 'md:opacity-100',
        )}
      >
        <MoreHorizontal size={14} />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} align="end" width={210}>
        {menu(() => setOpen(false))}
      </Popover>
    </div>
  );
}

// ---- the editor -------------------------------------------------------------------------------

/** Text colours worth a warning when they get hard to read, and what they sit on. */
const READ_ON: Partial<Record<ThemeToken, ThemeToken[]>> = {
  fg: ['bg', 'panel', 'sidebar', 'elevated', 'bg-3'],
  'fg-2': ['bg', 'panel', 'sidebar', 'elevated', 'bg-2'],
  'fg-3': ['bg', 'panel', 'sidebar', 'elevated', 'bg-1'],
  'accent-fg': ['accent'],
  'term-fg': ['term-bg'],
};

function ThemeEditor({ start, onClose }: { start: Draft; onClose: () => void }) {
  const [d, setD] = useState(start);
  const [busy, setBusy] = useState(false);
  const theme: AppTheme = { id: d.id ?? 'draft', name: d.name, base: d.base, colors: d.colors };

  // The page shows the draft while you edit; closing puts the picked theme back.
  useEffect(() => paintTheme(theme), [d]);
  useEffect(() => () => applyTheme(), []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);

  const set = (k: ThemeToken, v: string) => setD((x) => ({ ...x, colors: { ...x.colors, [k]: v } }));
  const save = async () => {
    const name = d.name.trim() || 'My theme';
    const t: AppTheme = { id: d.id ?? newId(name), name, base: d.base, colors: d.colors };
    const list = useThemes.getState().custom;
    setBusy(true);
    try {
      await saveThemes(list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t]);
      pickTheme(t);
      toast(`Saved ${name}`, 'ok');
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const groups = [...new Set(THEME_TOKENS.map((t) => t.group))];
  return createPortal(
    <div
      role="dialog"
      aria-label={d.id ? 'Edit theme' : 'New theme'}
      className="fixed inset-x-0 bottom-0 z-50 flex h-[64dvh] flex-col rounded-t-[20px] border border-line bg-elevated shadow-lg md:inset-y-3 md:right-3 md:left-auto md:h-auto md:w-[380px] md:rounded-[18px]"
    >
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
        <div className="min-w-0 flex-1 text-[15px] font-semibold tracking-tight">{d.id ? 'Edit theme' : 'New theme'}</div>
        <IconButton label="Close without saving" size="sm" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        <div className="flex gap-3">
          <ThemeThumb theme={theme} className="hidden aspect-[16/10] w-[132px] shrink-0 overflow-hidden rounded-lg ring-1 ring-line sm:block" />
          <div className="min-w-0 flex-1 space-y-2">
            <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={40} placeholder="Name" aria-label="Name" className={cx(inputCls, 'h-8.5 text-[13.5px]')} />
            <div className="flex items-center gap-2 text-[12px] text-fg-3">
              <Segmented<ThemeBase>
                size="sm"
                value={d.base}
                onChange={(base) => setD({ ...d, base })}
                options={[
                  { value: 'dark', label: 'Dark' },
                  { value: 'light', label: 'Light' },
                ]}
              />
              <span className="leading-tight">sets code and terminal colours</span>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-fg-3">The whole app shows your changes as you make them. Nothing is kept until you save.</p>
        {groups.map((g) => (
          <div key={g} className="mt-3">
            <div className="mb-0.5 text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">{g}</div>
            {THEME_TOKENS.filter((t) => t.group === g).map((t) => {
              const low = READ_ON[t.key] ? Math.min(...READ_ON[t.key]!.map((s) => contrast(d.colors[t.key], d.colors[s]))) : null;
              const need = t.key === 'fg-3' ? 3 : 4.5;
              return (
                <ColorRow key={t.key} label={t.label} hint={'hint' in t ? t.hint : undefined} value={d.colors[t.key]} onChange={(v) => set(t.key, v)}>
                  {low !== null && low < need && (
                    <span className="inline-flex items-center gap-1 text-warn" title={`${low.toFixed(1)}:1 on one of the backgrounds it sits on; ${need}:1 reads well`}>
                      <TriangleAlert size={11} /> hard to read ({low.toFixed(1)}:1)
                    </span>
                  )}
                </ColorRow>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-line px-4 pt-2.5 pb-[max(12px,var(--safe-bottom))]">
        <Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={() => copyTheme({ name: d.name, base: d.base, colors: d.colors })}>
          Copy
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save theme'}
        </Button>
      </div>
    </div>,
    document.body,
  );
}

function ColorRow({ label, hint, value, onChange, children }: { label: string; hint?: string; value: string; onChange: (v: string) => void; children?: ReactNode }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-fg">{label}</div>
        {(hint || children) && <div className="truncate text-[11.5px] text-fg-3">{children ?? hint}</div>}
      </div>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="swatch h-7 w-9 shrink-0" />
      <input
        value={text}
        aria-label={`${label}, hex`}
        spellCheck={false}
        maxLength={7}
        onChange={(e) => {
          setText(e.target.value);
          const hex = normalizeHex(e.target.value);
          if (hex && e.target.value.replace('#', '').length === 6) onChange(hex);
        }}
        onBlur={() => {
          const hex = normalizeHex(text);
          if (hex) onChange(hex);
          setText(hex ?? value);
        }}
        className="h-7 w-[104px] shrink-0 rounded-md border border-line-2 bg-bg-1 px-2 font-mono text-[12px] outline-none focus:border-accent/60 md:w-[78px]"
      />
    </div>
  );
}

/** A theme someone copied to share, pasted in to keep. */
function ImportTheme({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setText('');
  }, [open]);
  const go = async () => {
    let t: AppTheme | null = null;
    try {
      t = cleanTheme(JSON.parse(text));
    } catch {}
    if (!t || !Object.keys(t.colors).length) return toast('That is not a theme: paste what “Copy to share” gave you', 'error');
    const theme = { ...t, id: newId(t.name) };
    setBusy(true);
    try {
      await saveThemes([...useThemes.getState().custom, theme]);
      pickTheme(theme);
      toast(`Added ${theme.name}`, 'ok');
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import a theme"
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={go} disabled={busy || !text.trim()}>
            {busy ? 'Adding…' : 'Add theme'}
          </Button>
        </>
      }
    >
      <p className="mb-2 text-[13px] leading-relaxed text-fg-3">Paste a theme copied with “Copy to share”.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={9}
        spellCheck={false}
        placeholder={'{\n  "name": "…",\n  "base": "dark",\n  "colors": { "bg": "#121110", … }\n}'}
        className={cx(inputCls, 'h-auto py-2 font-mono text-[12px] leading-relaxed')}
        autoFocus
      />
    </Dialog>
  );
}
