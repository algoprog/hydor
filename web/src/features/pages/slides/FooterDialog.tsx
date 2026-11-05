// Insert → Slide numbers and footer: what the foot of every slide shows (its number at the right, words in the
// middle, the date at the left: today's, or one written as it should show), on every slide or every one but the title
// slide; and whether this slide leaves it off. Each change shows at once on the slide behind it.
import { useState } from 'react';
import type { Deck, Footer } from '@shared/slides';
import { Button, Dialog, inputCls, Segmented, Switch } from '../../../components/ui';
import { LOCALE } from '../../../i18n/locale';
import { setSlide } from './ops';

export function FooterDialog({ open, onClose, deck, index, change }: { open: boolean; onClose: () => void; deck: Deck; index: number; change: (d: Deck | ((d: Deck) => Deck), key?: string) => void }) {
  const f: Footer = deck.footer ?? {};
  const [fixed, setFixed] = useState(() => (f.date && f.date !== 'today' ? f.date : new Date().toLocaleDateString(LOCALE, { year: 'numeric', month: 'long', day: 'numeric' })));
  const set = (patch: Partial<Footer>) =>
    change((d) => {
      const next: Footer = { ...(d.footer ?? {}), ...patch };
      for (const k of Object.keys(next) as (keyof Footer)[]) if (next[k] === undefined || next[k] === '' || next[k] === false) delete next[k];
      const { footer: _f, ...rest } = d;
      return next.num || next.text || next.date ? { ...rest, footer: next } : rest;
    }, 'footer');
  const slide = deck.slides[index];
  const row = 'flex min-h-10 items-center gap-3 text-[13.5px] text-fg';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Slide numbers and footer"
      width={460}
      footer={
        <Button size="sm" variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-1">
        <label className={row}>
          <span className="min-w-0 flex-1">Slide number</span>
          <Switch label="Slide number" on={!!f.num} onChange={(num) => set({ num })} />
        </label>
        <label className={row}>
          <span className="min-w-0 flex-1">Date</span>
          <Switch label="Date" on={!!f.date} onChange={(on) => set({ date: on ? 'today' : undefined })} />
        </label>
        {f.date && (
          <div className="space-y-2 pb-2 pl-1">
            <Segmented
              size="sm"
              value={f.date === 'today' ? 'today' : 'fixed'}
              onChange={(v) => set({ date: v === 'today' ? 'today' : fixed })}
              options={[
                { value: 'today', label: 'The day it is shown' },
                { value: 'fixed', label: 'Written as' },
              ]}
            />
            {f.date !== 'today' && (
              <input
                value={fixed}
                maxLength={60}
                onChange={(e) => {
                  setFixed(e.target.value);
                  set({ date: e.target.value.trim() || 'today' });
                }}
                aria-label="The date as it shows"
                className={inputCls}
              />
            )}
          </div>
        )}
        <label className={row}>
          <span className="min-w-0 flex-1">Footer</span>
          <Switch label="Footer" on={f.text !== undefined} onChange={(on) => set({ text: on ? 'Footer' : undefined })} />
        </label>
        {f.text !== undefined && (
          <div className="pb-2 pl-1">
            <input value={f.text} maxLength={200} onChange={(e) => set({ text: e.target.value || ' ' })} placeholder="Words at the foot of each slide" aria-label="The footer’s words" translate="no" className={inputCls} />
          </div>
        )}
        <div className="my-2 h-px bg-line" />
        <label className={row}>
          <span className="min-w-0 flex-1">Not on the title slide</span>
          <Switch label="Not on the title slide" on={!!f.skipTitle} onChange={(skipTitle) => set({ skipTitle })} />
        </label>
        <label className={row}>
          <span className="min-w-0 flex-1">Leave it off this slide</span>
          <Switch label="Leave it off this slide" on={!!slide?.nofooter} onChange={(off) => change((d) => setSlide(d, index, (s) => ({ ...s, nofooter: off || undefined })))} />
        </label>
      </div>
    </Dialog>
  );
}
