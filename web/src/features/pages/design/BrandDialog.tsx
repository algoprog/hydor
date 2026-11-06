// The brand kit, edited: its name, its colours (picked, or suggested from a picture or from a mood), a heading font and
// a body font, and its logos. Kept by the app for every design (and every device), and told to agents making designs.
import { useEffect, useRef, useState } from 'react';
import { ImageUp, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { BRAND_LIMITS, type BrandKit } from '@shared/design-brand';
import { post } from '../../../lib/api';
import { toastError } from '../../../lib/store';
import { Button, cx, Dialog, inputCls, Throbber } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { pictureData } from '../studio/Inspector';
import { FontPicker } from './Inspector';
import { useBrandStore } from './brand';
import { coloursOf } from './colours';

export function BrandDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const saved = useBrandStore((s) => s.kit);
  const [kit, setKit] = useState<BrandKit>({ colours: [], fonts: ['', ''], logos: [] });
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState('');
  const [moodBusy, setMoodBusy] = useState(false);
  const pic = useRef<HTMLInputElement>(null);
  const logo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) setKit(saved ? { ...saved, fonts: [saved.fonts[0] ?? '', saved.fonts[1] ?? ''] } : { colours: [], fonts: ['', ''], logos: [] });
  }, [open, saved]);
  const set = (p: Partial<BrandKit>) => setKit((k) => ({ ...k, ...p }));
  const save = async () => {
    setBusy(true);
    try {
      await useBrandStore.getState().save(kit);
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const fromMood = async () => {
    if (!mood.trim()) return;
    setMoodBusy(true);
    try {
      const r = await post<{ colours: string[] }>('/api/write/palette', { mood });
      set({ colours: r.colours.slice(0, BRAND_LIMITS.colours) });
    } catch (e) {
      toastError(e);
    } finally {
      setMoodBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Brand kit"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-[13px]">
        <p className="text-[12.5px] leading-snug text-fg-3">{tr('Kept for all your designs: offered first in their pickers, put on a whole design with Apply my brand, and told to agents that make designs for you.')}</p>
        <label className="block space-y-1">
          <span className="text-[12.5px] font-medium text-fg-2">Its name</span>
          <input value={kit.name ?? ''} maxLength={BRAND_LIMITS.name} onChange={(e) => set({ name: e.target.value })} placeholder="The Corner Bakery" className={cx(inputCls, 'w-full')} />
        </label>
        <div className="space-y-1.5">
          <div className="text-[12.5px] font-medium text-fg-2">Colours</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {kit.colours.map((c, i) => (
              <span key={`${c}${i}`} className="group relative">
                <label className="relative block h-9 w-9 cursor-pointer overflow-hidden rounded-full border border-line-2" style={{ background: c }} title={c}>
                  <input type="color" value={c} onChange={(e) => set({ colours: kit.colours.map((x, j) => (j === i ? e.target.value : x)) })} className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
                <button type="button" aria-label={tr('Remove')} onClick={() => set({ colours: kit.colours.filter((_, j) => j !== i) })} className="absolute -top-1 -right-1 hidden h-4.5 w-4.5 place-items-center rounded-full bg-fg text-bg group-hover:grid">
                  <X size={10} />
                </button>
              </span>
            ))}
            {kit.colours.length < BRAND_LIMITS.colours && (
              <label className="relative grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-dashed border-line-2 text-fg-3 hover:text-fg" title={tr('Add a colour')}>
                <Plus size={15} />
                <input type="color" onChange={(e) => set({ colours: [...kit.colours, e.target.value] })} className="absolute inset-0 cursor-pointer opacity-0" />
              </label>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Button size="sm" variant="ghost" icon={<ImageUp size={14} />} onClick={() => pic.current?.click()} title="Read here: the picture goes nowhere">
              From a picture
            </Button>
            <input value={mood} onChange={(e) => setMood(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void fromMood()} placeholder={tr('Or a mood: warm and earthy, calm and fresh…')} className={cx(inputCls, 'h-8 min-w-0 flex-1 text-[12.5px]')} />
            <Button size="sm" variant="secondary" icon={moodBusy ? <Throbber size={13} /> : <Sparkles size={14} />} disabled={!mood.trim() || moodBusy} onClick={() => void fromMood()} title="By the helper model (Settings → Models)">
              Suggest
            </Button>
          </div>
          <input
            ref={pic}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f)
                void pictureData(f)
                  .then((src) => coloursOf(src, 6))
                  .then((cs) => set({ colours: cs.slice(0, BRAND_LIMITS.colours) }))
                  .catch(toastError);
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(['Heading font', 'Body font'] as const).map((label, i) => (
            <div key={label} className="min-w-0 space-y-1">
              <div className="text-[12.5px] font-medium text-fg-2">{tr(label)}</div>
              <div className="flex items-center gap-1">
                <FontPicker value={kit.fonts[i] ?? ''} brand={[]} onPick={(f) => set({ fonts: kit.fonts.map((x, j) => (j === i ? f : x)) })} />
                {kit.fonts[i] && (
                  <button type="button" aria-label={tr('Remove')} onClick={() => set({ fonts: kit.fonts.map((x, j) => (j === i ? '' : x)) })} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-bg-2">
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <div className="text-[12.5px] font-medium text-fg-2">Logos</div>
          <div className="flex flex-wrap gap-1.5">
            {kit.logos.map((l, i) => (
              <span key={l.src} className="group relative grid h-16 w-16 place-items-center overflow-hidden rounded-lg border border-line bg-[repeating-conic-gradient(#e5e5e5_0_25%,#fff_0_50%)] bg-[length:12px_12px] p-1">
                <img src={`/api/pages/assets/${l.src.slice('naget-asset:'.length)}`} alt={l.name} className="max-h-full max-w-full object-contain" />
                <button type="button" aria-label={tr('Remove')} onClick={() => set({ logos: kit.logos.filter((_, j) => j !== i) })} className="absolute top-0.5 right-0.5 hidden h-5 w-5 place-items-center rounded-md bg-fg/80 text-bg group-hover:grid">
                  <Trash2 size={11} />
                </button>
              </span>
            ))}
            {kit.logos.length < BRAND_LIMITS.logos && (
              <button type="button" onClick={() => logo.current?.click()} className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-line-2 text-fg-3 hover:text-fg" title={tr('Add a logo')}>
                <Plus size={16} />
              </button>
            )}
          </div>
          <input
            ref={logo}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              void pictureData(f)
                .then((data) => post<{ src: string }>('/api/pages/assets', { data }))
                .then((r) => set({ logos: [...kit.logos, { src: r.src, name: f.name.replace(/\.[^.]+$/, '') }] }))
                .catch(toastError);
            }}
          />
        </div>
      </div>
    </Dialog>
  );
}
