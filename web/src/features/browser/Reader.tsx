// Reader view in the address bar: a button when the page has an article (lit while reader view is on), and, while it is on,
// an "Aa" button that opens how the article looks: text size, colours and font. The server restyles the page at each change.
import { useRef, useState } from 'react';
import { BookOpenText, Minus, Plus, Type } from 'lucide-react';
import { READER_DEFAULTS, type BrowserTab, type ReaderPrefs } from '@shared/browser';
import { cx, IconButton, Popover, Segmented } from '../../components/ui';
import { savePrefs, setReader, usePrefs } from './browsing';

const MIN_SIZE = 14;
const MAX_SIZE = 28;

/** Whether the tab's page can be shown in reader view (or already is). */
export const readerOffered = (tab: BrowserTab | undefined) => !!tab && /^https?:/i.test(tab.url) && !!(tab.readerable || tab.reader);

/** How reader view looks now: what is kept, over the defaults. */
export function useReaderPrefs(): ReaderPrefs {
  const r = usePrefs((s) => s.prefs?.reader);
  return { ...READER_DEFAULTS, ...r };
}

/** Changes one part of how articles look: shown at once, then kept. */
function saveReader(p: Partial<ReaderPrefs>) {
  usePrefs.setState((s) => (s.prefs ? { prefs: { ...s.prefs, reader: { ...READER_DEFAULTS, ...s.prefs.reader, ...p } } } : s));
  void savePrefs({ reader: p });
}

export function ReaderButtons({ tab }: { tab: BrowserTab }) {
  const style = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const r = useReaderPrefs();
  if (!readerOffered(tab)) return null;
  const on = !!tab.reader;
  return (
    <>
      <button
        aria-label={on ? 'Leave reader view' : 'Reader view'}
        title={on ? 'Leave reader view' : 'Reader view'}
        aria-pressed={on}
        onClick={() => void setReader(tab.id, !on)}
        className={cx('ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-bg-3', on ? 'bg-accent-soft text-accent' : 'text-fg-3 hover:text-fg')}
      >
        <BookOpenText size={15} />
      </button>
      {on && (
        <>
          <button
            ref={style}
            aria-label="Reader view style"
            title="Reader view style"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={cx('ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-3 hover:bg-bg-3 hover:text-fg', open && 'bg-bg-3 text-fg')}
          >
            <Type size={15} />
          </button>
          <Popover anchor={style} open={open} onClose={() => setOpen(false)} align="end" width={290} title="Reader view style">
            <div className="space-y-3.5 p-2.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 text-[13px] text-fg-2">Text size</div>
                <IconButton label="Smaller text" size="sm" disabled={r.size <= MIN_SIZE} onClick={() => saveReader({ size: Math.max(MIN_SIZE, r.size - 1) })}>
                  <Minus size={14} />
                </IconButton>
                <span className="tnum w-8 text-center text-[13px]">{r.size}</span>
                <IconButton label="Larger text" size="sm" disabled={r.size >= MAX_SIZE} onClick={() => saveReader({ size: Math.min(MAX_SIZE, r.size + 1) })}>
                  <Plus size={14} />
                </IconButton>
              </div>
              <div className="space-y-1.5">
                <div className="text-[13px] text-fg-2">Colours</div>
                <Segmented<ReaderPrefs['theme']>
                  size="sm"
                  value={r.theme}
                  onChange={(theme) => saveReader({ theme })}
                  options={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'dark', label: 'Dark' },
                    { value: 'light', label: 'Light' },
                    { value: 'sepia', label: 'Sepia' },
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <div className="text-[13px] text-fg-2">Font</div>
                <Segmented<ReaderPrefs['font']>
                  size="sm"
                  value={r.font}
                  onChange={(font) => saveReader({ font })}
                  options={[
                    { value: 'serif', label: 'Serif' },
                    { value: 'sans', label: 'Sans' },
                  ]}
                />
              </div>
            </div>
          </Popover>
        </>
      )}
    </>
  );
}
