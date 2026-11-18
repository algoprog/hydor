// The browser settings' groups for translating pages and for how pages are shown (zoom, spell checking, dark pages, sound by themselves).
import { useRef, useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { PAGE_ZOOMS, TRANSLATE_LANGS } from '@shared/browser';
import { go } from '../../lib/nav';
import { Button, OptionRow, Popover, Switch } from '../../components/ui';
import { Group, Row, Select } from '../settings/kit';
import { savePrefs, usePrefs, zoomPercent } from './browsing';
import { langChoice, langLabel } from './languages';
import { LANG_OPTIONS } from './Translate';

/** A list of small chips, each with a × that takes it away. `none`: what shows while the list is empty. */
function Chips({ items, label, onRemove, none }: { items: { id: string; text: string }[]; label: (text: string) => string; onRemove: (id: string) => void; none?: ReactNode }) {
  if (!items.length) return none ? <div className="text-[12.5px] text-fg-3">{none}</div> : null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i.id} className="inline-flex h-7 items-center gap-0.5 rounded-full bg-bg-2 pr-1 pl-2.5 text-[12.5px] ring-1 ring-line-2 ring-inset">
          <span translate="no">{i.text}</span>
          <button type="button" aria-label={label(i.text)} title={label(i.text)} onClick={() => onRemove(i.id)} className="flex h-5 w-5 items-center justify-center rounded-full text-fg-3 hover:bg-bg-3 hover:text-fg">
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}

/** "Add a language": a button that lists the languages left to pick. */
function AddLanguage({ taken, onAdd }: { taken: string[]; onAdd: (code: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const left = TRANSLATE_LANGS.filter((l) => !taken.includes(l.code));
  return (
    <>
      <Button ref={ref} size="sm" variant="secondary" icon={<Plus size={14} />} disabled={!left.length} aria-label="Add a language" onClick={() => setOpen((o) => !o)}>
        Add a language
      </Button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={260} className="max-h-72" title="Add a language">
        {left.map((l) => (
          <OptionRow
            key={l.code}
            label={<span translate="no">{langChoice(l)}</span>}
            onClick={() => {
              setOpen(false);
              onAdd(l.code);
            }}
          />
        ))}
      </Popover>
    </>
  );
}

/** Translation: the language to translate into, the offer, the languages always or never translated, and the sites never translated. */
export function TranslationGroup() {
  const prefs = usePrefs((s) => s.prefs);
  if (!prefs) return null;
  const always = prefs.translateAlways ?? [];
  const never = prefs.translateNever ?? [];
  const sites = prefs.translateNeverSites ?? [];
  const taken = [...always, ...never];
  return (
    <Group title="Translation">
      <Row label="Translate into" control={<Select<string> label="Translate into" value={prefs.translateTo} options={LANG_OPTIONS} onChange={(v) => void savePrefs({ translateTo: v })} width={240} />} />
      <Row label="Offer to translate pages in other languages" control={<Switch on={prefs.translateOffer} label="Offer to translate pages in other languages" onChange={(v) => void savePrefs({ translateOffer: v })} />} />
      <Row label="Always translate">
        <div className="space-y-2">
          <Chips items={always.map((c) => ({ id: c, text: langLabel(c) }))} label={(t) => `Stop always translating ${t}`} onRemove={(c) => void savePrefs({ translateAlways: always.filter((x) => x !== c) })} />
          <AddLanguage taken={taken} onAdd={(c) => void savePrefs({ translateAlways: [...always, c] })} />
        </div>
      </Row>
      <Row label="Never translate">
        <div className="space-y-2">
          <Chips items={never.map((c) => ({ id: c, text: langLabel(c) }))} label={(t) => `Stop never translating ${t}`} onRemove={(c) => void savePrefs({ translateNever: never.filter((x) => x !== c) })} />
          <AddLanguage taken={taken} onAdd={(c) => void savePrefs({ translateNever: [...never, c] })} />
        </div>
      </Row>
      <Row label="Never translate these sites">
        <Chips items={sites.map((h) => ({ id: h, text: h }))} label={(t) => `Translate ${t} again`} onRemove={(h) => void savePrefs({ translateNeverSites: sites.filter((x) => x !== h) })} none="No sites" />
      </Row>
      <div className="px-4 py-3 text-[12.5px] leading-snug text-fg-3">
        Translating sends the page’s words to the helper model (
        <button type="button" className="text-accent hover:underline" onClick={() => go('/settings?s=models&find=Helper%20model')}>
          Settings → Models → Helper model
        </button>
        ): on Automatic that is Claude Haiku, online; a model on this computer keeps them here.
      </div>
    </Group>
  );
}

/** Pages: how big they are, spell checking, dark pages (and the sites shown as they are) and whether sites may play sound by themselves. */
export function PagesGroup() {
  const prefs = usePrefs((s) => s.prefs);
  if (!prefs) return null;
  const except = prefs.darkExcept ?? [];
  return (
    <Group title="Pages">
      <Row
        label="Page zoom"
        hint="How big pages are, unless you zoom a site yourself"
        control={<Select<string> label="Page zoom" value={String(prefs.zoom)} options={PAGE_ZOOMS.map((z) => ({ value: String(z), label: `${zoomPercent(z)} %` }))} onChange={(v) => void savePrefs({ zoom: Number(v) })} width={120} />}
      />
      <Row
        label="Check spelling"
        hint="Underlines misspelled words as you type, with suggestions in the right-click menu"
        control={<Switch on={prefs.spellcheck} label="Check spelling" onChange={(v) => void savePrefs({ spellcheck: v })} />}
      />
      <Row
        label="Dark pages"
        hint="Pages that have no dark look of their own are shown in dark colours. Some may look odd: turn it off for a site from its padlock."
        control={<Switch on={prefs.darkPages} label="Dark pages" onChange={(v) => void savePrefs({ darkPages: v })} />}
      />
      <Row label="Sites shown as they are">
        <Chips items={except.map((h) => ({ id: h, text: h }))} label={(t) => `Show ${t} in dark colours again`} onRemove={(h) => void savePrefs({ darkExcept: except.filter((x) => x !== h) })} none="No sites" />
      </Row>
      <Row
        label="Let sites play sound by themselves"
        hint="Off: a page’s sound waits until you click or type in it; videos without sound still play. It applies to tabs opened after you change it."
        control={<Switch on={prefs.autoplay} label="Let sites play sound by themselves" onChange={(v) => void savePrefs({ autoplay: v })} />}
      />
    </Group>
  );
}
