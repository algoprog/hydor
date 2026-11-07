// My themes and a logo (Canva's brand kit), in the slides' Theme tab: Save as my theme keeps the deck's colours and
// fonts (and its logo) under a name, listed under My themes here and in New page → Slides; one picked puts its look and
// logo on the deck. A logo on every slide: a picture, its corner and size, not on the title slide if wanted. A slide
// that kept the look of the deck it came from says so, with a way to give it this deck's.
import { useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowDownRight, ArrowUpLeft, ArrowUpRight, ImagePlus, MoreHorizontal, Trash2 } from 'lucide-react';
import { create } from 'zustand';
import type { MyTheme } from '@shared/my-themes';
import { newDeck, type Deck, type Logo, type Ratio, type Theme } from '@shared/slides';
import { sameLook } from '@shared/slides-reuse';
import { api, del, enc, patch, post } from '../../../lib/api';
import { toast, toastError } from '../../../lib/store';
import { Button, cx, inputCls, MenuItem, Popover, Switch } from '../../../components/ui';
import { Field, Section, Tool } from './controls';
import { PICS } from './rt';
import { SlideThumb } from './Thumb';
import { setSlide } from './ops';

type Change = (d: Deck | ((d: Deck) => Deck), key?: string) => void;

// ---- the user's themes ------------------------------------------------------------------------------------------

interface MyThemesState {
  list: MyTheme[] | null;
  load(): Promise<void>;
  save(name: string, theme: Theme, logo?: Logo): Promise<MyTheme>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export const useMyThemes = create<MyThemesState>((set, get) => ({
  list: null,
  load: () => api<{ themes: MyTheme[] }>('/api/slides/themes').then((r) => set({ list: r.themes })),
  async save(name, theme, logo) {
    const r = await post<{ theme: MyTheme }>('/api/slides/themes', { name, theme, ...(logo ? { logo } : {}) });
    set({ list: [r.theme, ...(get().list ?? []).filter((t) => t.id !== r.theme.id)] });
    return r.theme;
  },
  async rename(id, name) {
    const r = await patch<{ theme: MyTheme }>(`/api/slides/themes/${enc(id)}`, { name });
    set({ list: (get().list ?? []).map((t) => (t.id === id ? r.theme : t)) });
  },
  async remove(id) {
    await del(`/api/slides/themes/${enc(id)}`);
    set({ list: (get().list ?? []).filter((t) => t.id !== id) });
  },
}));

/** The user's themes, loaded once they are asked for. */
export function useMyThemeList(): MyTheme[] | null {
  const list = useMyThemes((s) => s.list);
  useEffect(() => {
    if (!list)
      void useMyThemes
        .getState()
        .load()
        .catch(() => {});
  }, [list]);
  return list;
}

/** A new deck in one of the user's themes (New page → Slides), its logo on it. */
export function myThemeDeck(t: MyTheme, title: string, ratio: Ratio): Deck {
  const d = newDeck(title, 'paper', ratio);
  return { ...d, theme: { ...t.theme, colors: [...t.theme.colors] }, ...(t.logo ? { logo: { ...t.logo } } : {}) };
}

/** A theme shown small: big letters in its heading font, a bar of its accent, its fonts' names, its logo. */
function sample(t: MyTheme): Deck {
  const theme = t.theme;
  return {
    v: 1,
    ratio: '16:9',
    theme,
    ...(t.logo ? { logo: { ...t.logo, w: t.logo.w * 1.6, h: t.logo.h * 1.6 } } : {}),
    slides: [
      {
        id: 'sample',
        els: [
          { id: 't', type: 'text', x: 80, y: 220, w: 1120, h: 170, paras: [{ runs: [{ t: 'Aa' }] }], role: 'title', size: 150, bold: true, valign: 'bottom', lh: 1 },
          { id: 'b', type: 'shape', shape: 'round', x: 90, y: 420, w: 120, h: 14, fill: 'accent', radius: 7, paras: [{ runs: [{ t: '' }] }], size: 20 },
          { id: 's', type: 'text', x: 80, y: 460, w: 1120, h: 80, paras: [{ runs: [{ t: theme.headFont === theme.font ? theme.font : `${theme.headFont} · ${theme.font}` }] }], size: 44, color: 'muted' },
        ],
      },
    ],
  };
}

/** A theme's card: its sample, its name; a click picks it. */
export function ThemeCard({ t, on, width, onPick, menu }: { t: MyTheme; on: boolean; width: number; onPick: () => void; menu?: (anchor: HTMLButtonElement) => void }) {
  const d = sample(t);
  return (
    <div className={cx('group relative overflow-hidden rounded-lg border text-left transition-colors', on ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-line-2')}>
      <button type="button" onClick={onPick} className="block w-full text-left">
        <SlideThumb deck={d} index={0} slide={d.slides[0]} theme={d.theme} width={width} fonts={0} />
        <span translate="no" className="block truncate px-2 py-1 pr-7 text-[12px] text-fg-2">
          {t.name}
        </span>
      </button>
      {menu && (
        <button type="button" title="More" aria-label="More" onClick={(e) => menu(e.currentTarget)} className="absolute right-1 bottom-0.5 grid h-6 w-6 place-items-center rounded-md text-fg-3 hover:bg-bg-2 hover:text-fg">
          <MoreHorizontal size={14} />
        </button>
      )}
    </div>
  );
}

/** The Theme tab's My themes: the user's, to put on the deck, rename or delete; and Save as my theme. */
export function MyThemesSection({ deck, change }: { deck: Deck; change: Change }) {
  const list = useMyThemeList();
  const [naming, setNaming] = useState<{ id?: string; name: string } | null>(null);
  const [menu, setMenu] = useState<{ t: MyTheme; at: HTMLButtonElement } | null>(null);
  const anchor = useRef<HTMLButtonElement | null>(null);
  anchor.current = menu?.at ?? null;
  const same = naming && !naming.id ? (list ?? []).find((t) => t.name.toLowerCase() === naming.name.trim().toLowerCase()) : undefined;
  const save = async () => {
    const name = naming?.name.trim();
    if (!naming || !name) return;
    try {
      if (naming.id) await useMyThemes.getState().rename(naming.id, name);
      else {
        await useMyThemes.getState().save(name, deck.theme, deck.logo);
        toast(`Saved as “${name}”: in My themes here and in New page → Slides`, 'ok');
      }
      setNaming(null);
    } catch (e) {
      toastError(e);
    }
  };
  const put = (t: MyTheme) => change((d) => ({ ...d, theme: { ...t.theme, colors: [...t.theme.colors] }, ...(t.logo ? { logo: { ...t.logo } } : {}) }));
  return (
    <Section
      title="My themes"
      aside={
        !naming && (
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setNaming({ name: '' })}>
            Save as my theme
          </Button>
        )
      }
    >
      {naming && (
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            autoFocus
            value={naming.name}
            onChange={(e) => setNaming({ ...naming, name: e.target.value })}
            onKeyDown={(e) => (e.stopPropagation(), e.key === 'Escape' && setNaming(null))}
            placeholder="Its name: your brand, a client…"
            aria-label="The theme’s name"
            maxLength={60}
            className={cx(inputCls, 'h-8 text-[12.5px]')}
          />
          {!naming.id && <p className="text-[11.5px] leading-snug text-fg-3">{same ? `Saves over “${same.name}”.` : `This deck’s colours and fonts${deck.logo ? ', and its logo' : ''}.`}</p>}
          <div className="flex gap-1.5">
            <Button size="sm" variant="primary" type="submit" disabled={!naming.name.trim()}>
              {naming.id ? 'Rename' : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNaming(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {list && !list.length && !naming && <p className="text-[12px] leading-snug text-fg-3">Keep this deck’s colours, fonts and logo to use again, here and in New page → Slides.</p>}
      {!!list?.length && (
        <div className="grid grid-cols-2 gap-2">
          {list.map((t) => (
            <ThemeCard key={t.id} t={t} on={sameLook(t.theme, deck.theme)} width={132} onPick={() => put(t)} menu={(at) => setMenu({ t, at })} />
          ))}
        </div>
      )}
      <Popover anchor={anchor} open={!!menu} onClose={() => setMenu(null)} width={200}>
        <MenuItem onClick={() => (setNaming({ id: menu!.t.id, name: menu!.t.name }), setMenu(null))}>Rename</MenuItem>
        <MenuItem
          icon={<Trash2 size={14} />}
          danger
          onClick={() => {
            const t = menu!.t;
            setMenu(null);
            void useMyThemes
              .getState()
              .remove(t.id)
              .then(() => toast(`“${t.name}” deleted`, 'ok'), toastError);
          }}
        >
          Delete
        </MenuItem>
      </Popover>
    </Section>
  );
}

// ---- the logo -------------------------------------------------------------------------------------------------------

const CORNERS: { at: Logo['at']; label: string; icon: React.ReactNode }[] = [
  { at: 'tl', label: 'Top left', icon: <ArrowUpLeft size={15} /> },
  { at: 'tr', label: 'Top right', icon: <ArrowUpRight size={15} /> },
  { at: 'bl', label: 'Bottom left', icon: <ArrowDownLeft size={15} /> },
  { at: 'br', label: 'Bottom right', icon: <ArrowDownRight size={15} /> },
];

/** A logo's size for a picture: 140 across, or less for a tall one (at most 140 high). */
const logoSize = (w: number, h: number) => {
  const k = h / Math.max(1, w);
  return k > 1 ? { w: Math.round(140 / k), h: 140 } : { w: 140, h: Math.max(16, Math.round(140 * k)) };
};

/** The Theme tab's Logo: a picture on every slide, its corner, its size, and not on the title slide if wanted. */
export function LogoSection({ deck, change, pickPicture }: { deck: Deck; change: Change; pickPicture: () => Promise<{ src: string; w: number; h: number } | null> }) {
  const g = deck.logo;
  const add = async () => {
    const p = await pickPicture();
    if (!p) return;
    change((d) => ({ ...d, logo: { at: d.logo?.at ?? 'tr', ...(d.logo?.skipTitle ? { skipTitle: true } : {}), src: p.src, ...logoSize(p.w, p.h) } }));
  };
  const set = (patch: Partial<Logo>, key?: string) => change((d) => (d.logo ? { ...d, logo: { ...d.logo, ...patch } } : d), key);
  const sha = g ? /^naget-asset:([a-f0-9]{16,64})$/.exec(g.src)?.[1] : undefined;
  const shown = g ? (sha ? PICS.asset!(sha) : /^https?:/.test(g.src) ? PICS.web!(g.src) : g.src) : '';
  return (
    <Section title="Logo">
      {!g ? (
        <>
          <Button size="sm" variant="secondary" icon={<ImagePlus size={14} />} onClick={() => void add()}>
            A logo on every slide
          </Button>
          <p className="text-[11.5px] leading-snug text-fg-3">Your logo in a corner of each slide, in the slideshow and in the PowerPoint file too.</p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="grid h-10 w-16 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-[repeating-conic-gradient(rgba(127,127,127,.18)_0_25%,transparent_0_50%)] bg-[length:10px_10px]">
              {shown && <img src={shown} alt="" draggable={false} className="max-h-9 max-w-14 object-contain" />}
            </span>
            <Button size="sm" variant="ghost" onClick={() => void add()}>
              Another picture
            </Button>
            <Button size="sm" variant="ghost" className="text-err" onClick={() => change((d) => ({ ...d, logo: undefined }))}>
              Remove
            </Button>
          </div>
          <Field label="Corner">
            {CORNERS.map((c) => (
              <Tool key={c.at} label={c.label} on={g.at === c.at} onClick={() => set({ at: c.at })}>
                {c.icon}
              </Tool>
            ))}
          </Field>
          <Field label="Size">
            <input
              type="range"
              min={24}
              max={400}
              step={1}
              value={Math.round(Math.max(g.w, g.h))}
              onChange={(e) => {
                const v = Number(e.target.value);
                const k = g.h / Math.max(1, g.w);
                set(k > 1 ? { w: Math.max(8, Math.round(v / k)), h: v } : { w: v, h: Math.max(8, Math.round(v * k)) }, 'logo-size');
              }}
              className="min-w-0 flex-1 accent-[var(--accent)]"
              aria-label="Its size"
            />
          </Field>
          <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
            <span className="min-w-0 flex-1">Not on the title slide</span>
            <Switch label="Not on the title slide" on={!!g.skipTitle} onChange={(on) => set({ skipTitle: on || undefined })} />
          </label>
        </>
      )}
    </Section>
  );
}

/** A slide that kept the look of the deck it came from: said at the top of the Theme tab, with this deck's to give it. */
export function SlideLookNote({ deck, index, change }: { deck: Deck; index: number; change: Change }) {
  if (!deck.slides[index]?.theme) return null;
  return (
    <div className="mx-3 mt-3 space-y-1.5 rounded-lg bg-bg-1 p-2.5">
      <p className="text-[12px] leading-snug text-fg-3">This slide keeps the look of the deck it came from: the theme here changes the others.</p>
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          change((d) =>
            setSlide(d, index, (s) => {
              const { theme: _t, ...rest } = s;
              return rest;
            }),
          )
        }
      >
        Use this deck’s theme
      </Button>
    </div>
  );
}
