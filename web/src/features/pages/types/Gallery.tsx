// The gallery of kinds an agent makes (index.ts opens it): a box that finds one by name, the kind's groups as chips, and
// its types as small cards (an icon, a name, a line). One picked shows what it is and a box for what it is about (its
// hint as the example), then Make it composes the request (shared/content-asks.ts) and sends it on its way: through
// the Ask panel of the page open, to the caller, or to the start page for something new. As a picker (New in the
// Library), a card goes back as it is picked. The cards scroll inside a box of fixed height, so the dialog keeps its
// size and place as they are filtered; on a phone it is a sheet from the bottom. Nothing fades or moves in.
import { useMemo, useRef, useState } from 'react';
import { Search, Sparkles, X } from 'lucide-react';
import { CONTENT_GROUPS, findTypes, typesOf, type ContentKind, type ContentType } from '@shared/content-types';
import { Button, cx, Dialog, inputCls, useIsMobile } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { useAskRun } from '../../guide/ask';
import { useSpaces } from '../../spaces/state';
import { appLanguage, closeTypes, type TypesOpts } from './index';
import { TYPE_ICONS } from './icons';
import { madeRequest } from './requests';
import { startMaking } from './start';

const TITLE: Record<ContentKind, string> = {
  slide: 'Add a slide made with AI',
  section: 'Add a section made with AI',
  block: 'Add a block made with AI',
  deck: 'Slides made with AI',
  doc: 'A document made with AI',
  page: 'A page made with AI',
  sheet: 'A spreadsheet made with AI',
};
const PICK_TITLE: Partial<Record<ContentKind, string>> = { deck: 'What kind of slides?', doc: 'What kind of document?', page: 'What kind of page?', sheet: 'What kind of spreadsheet?' };

function TypeCard({ t, on, note, onClick }: { t: ContentType; on: boolean; note?: string; onClick: () => void }) {
  const Icon = TYPE_ICONS[t.icon];
  return (
    <button
      type="button"
      aria-pressed={on}
      title={t.blurb}
      onClick={onClick}
      className={cx('flex min-w-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors', on ? 'border-accent/60 bg-accent-soft' : 'border-line hover:border-line-2 hover:bg-bg-1')}
    >
      <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', on ? 'bg-accent text-accent-fg' : 'bg-bg-2 text-fg-2')}>{Icon && <Icon size={16} strokeWidth={1.9} />}</span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] leading-5 font-medium text-fg">{t.label}</span>
          {note && <span className="shrink-0 rounded-md bg-bg-2 px-1.5 text-[10.5px] leading-4 font-medium text-fg-3">{note}</span>}
        </span>
        <span className="block truncate text-[11.5px] leading-4 text-fg-3">{t.blurb}</span>
      </span>
    </button>
  );
}

export default function Gallery({ o }: { o: TypesOpts & { n: number } }) {
  const mobile = useIsMobile();
  const spaces = useSpaces();
  const run = useAskRun();
  const [find, setFind] = useState('');
  const [group, setGroup] = useState('all');
  const [picked, setPicked] = useState<ContentType | null>(null);
  const [words, setWords] = useState('');
  const wordsBox = useRef<HTMLInputElement>(null);
  const picker = !!o.onPick;
  // A deck that is PowerPoint compatible: the web format's own slides show, with a note, made as PowerPoint can.
  const pptx = o.kind === 'slide' && o.webDeck === false;
  const groups = CONTENT_GROUPS[o.kind];
  const q = find.trim();
  const shown = useMemo(() => (q ? findTypes(q, { kind: o.kind, shown: (t) => `${tr(t.label)} ${tr(t.blurb)}` }) : typesOf(o.kind).filter((t) => group === 'all' || t.group === group)), [q, group, o.kind]);
  // Nothing by that name: Make it asks for it in the words typed.
  const free = !!q && !shown.length && !picker;

  const send = (t: ContentType | null, w: string) => {
    const r = madeRequest(t, w, { kind: o.kind, after: o.after, at: o.at, webDeck: o.webDeck, lang: appLanguage() });
    if (!r) return;
    closeTypes();
    if (o.onDone) return o.onDone(r);
    if (o.pageId) {
      const page = o.pageId;
      return void import('../AskPage').then((m) => m.askNow(r.prompt, { page, make: r.make }));
    }
    // Something new: its session starts at once, in the project picked.
    startMaking(run, { prompt: r.prompt, make: r.make, space: o.space ? spaces?.find((s) => s.id === o.space) : null });
  };
  const pick = (t: ContentType) => {
    if (picker) {
      closeTypes();
      return o.onPick!(t);
    }
    setPicked(t);
    if (!mobile) requestAnimationFrame(() => wordsBox.current?.focus());
  };
  const make = () => (free ? send(null, q) : picked && send(picked, words));

  const line = picked
    ? `${tr(picked.blurb)}.${pptx && picked.web ? ` ${tr('This deck is PowerPoint compatible, so it is made as near as PowerPoint allows; Made for → The web, in the Theme tab, gives the deck the web format.')}` : ''}`
    : free
      ? tr(`No kind is called “${q}”: Make it asks for it in those words.`)
      : tr('Pick one, then say what it is about if you like.');

  return (
    <Dialog
      open
      onClose={closeTypes}
      title={(picker && PICK_TITLE[o.kind]) || TITLE[o.kind]}
      width={760}
      footer={
        picker ? (
          !mobile && (
            <Button variant="ghost" onClick={closeTypes}>
              Cancel
            </Button>
          )
        ) : (
          <div className="flex w-full min-w-0 flex-col gap-2">
            <p translate={free ? 'no' : undefined} className="line-clamp-2 min-h-[36px] text-[12.5px] leading-[18px] text-fg-2">
              {line}
            </p>
            <div className="flex min-w-0 items-end gap-2">
              <label className="min-w-0 flex-1 space-y-1">
                <span className="block text-[12px] font-medium text-fg-3">What about? (optional)</span>
                <input
                  ref={wordsBox}
                  value={words}
                  disabled={!picked}
                  maxLength={2000}
                  onChange={(e) => setWords(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && make()}
                  placeholder={picked?.hint ?? ''}
                  className={cx(inputCls, 'disabled:opacity-50')}
                />
              </label>
              {!mobile && (
                <Button variant="ghost" onClick={closeTypes}>
                  Cancel
                </Button>
              )}
              <Button variant="primary" icon={<Sparkles size={14} />} disabled={!picked && !free} onClick={make}>
                Make it
              </Button>
            </div>
          </div>
        )
      }
    >
      <div className={cx('flex flex-col gap-2.5', picker ? 'h-[min(520px,62dvh)]' : 'h-[min(460px,52dvh)]')}>
        <label className="flex h-9 shrink-0 items-center gap-2 rounded-xl border border-line bg-bg-1 px-2.5 focus-within:border-accent/50">
          <Search size={14} className="shrink-0 text-fg-3" />
          <input
            autoFocus={!mobile}
            value={find}
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
              if (shown[0]) pick(shown[0]);
              else if (free) make();
            }}
            placeholder="Find by name"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-fg-3"
          />
          {find && (
            <button type="button" onClick={() => setFind('')} className="text-fg-3 hover:text-fg" aria-label="Clear">
              <X size={14} />
            </button>
          )}
        </label>
        {!q && (
          <div className="-mx-1 flex shrink-0 gap-1.5 overflow-x-auto px-1 pb-0.5 [&::-webkit-scrollbar]:hidden" role="radiogroup" aria-label="Groups">
            {[{ id: 'all', label: 'All' }, ...groups].map((g) => (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={group === g.id}
                onClick={() => setGroup(g.id)}
                className={cx('h-7 shrink-0 rounded-full px-3 text-[12.5px] transition-colors', group === g.id ? 'bg-bg-3 font-medium text-fg' : 'text-fg-3 hover:bg-bg-2 hover:text-fg')}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1">
          {shown.length ? (
            <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 sm:grid-cols-3">
              {shown.map((t) => (
                <TypeCard key={t.id} t={t} on={picked?.id === t.id} note={pptx && t.web ? 'Web format' : undefined} onClick={() => pick(t)} />
              ))}
            </div>
          ) : (
            <p className="px-1 py-6 text-center text-[13px] text-fg-3">{picker ? 'No kind is called that. Close this and describe it in your own words.' : 'No kind is called that.'}</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
