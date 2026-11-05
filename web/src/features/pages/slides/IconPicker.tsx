// Insert → Icon and Insert → Emoji: Lucide's icons (about two thousand, found by their names: "arrow", "chart",
// "user") and emoji with the editors' character picker. An icon goes on the slide as lines of its own that stay
// sharp at any size and take the theme's colours; an emoji goes as words. The icons load the first time it opens.
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { IconNode } from '@shared/slides';
import { Dialog, Segmented } from '../../../components/ui';
import { CharPicker } from '../common/CharPicker';

export interface IconDef {
  name: string;
  paths: IconNode[];
}

let loading: Promise<IconDef[]> | null = null;
/** Lucide's icons, loaded once. */
export const loadIcons = () => (loading ??= import('./iconData').then((m) => m.ICONS));

/** What most decks want, first while nothing is asked for. */
const COMMON = [
  'check',
  'x',
  'star',
  'heart',
  'thumbs-up',
  'sparkles',
  'lightbulb',
  'rocket',
  'target',
  'flag',
  'trophy',
  'award',
  'zap',
  'flame',
  'chart-line',
  'chart-column',
  'chart-pie',
  'trending-up',
  'trending-down',
  'dollar-sign',
  'euro',
  'piggy-bank',
  'wallet',
  'credit-card',
  'shopping-cart',
  'store',
  'truck',
  'package',
  'users',
  'user',
  'user-plus',
  'handshake',
  'message-circle',
  'mail',
  'phone',
  'megaphone',
  'bell',
  'calendar',
  'clock',
  'timer',
  'hourglass',
  'map-pin',
  'globe',
  'house',
  'building-2',
  'factory',
  'briefcase',
  'graduation-cap',
  'book-open',
  'pencil',
  'clipboard-check',
  'list-checks',
  'file-text',
  'folder',
  'search',
  'settings',
  'shield-check',
  'lock',
  'key',
  'eye',
  'circle-check',
  'circle-alert',
  'triangle-alert',
  'info',
  'circle-help',
  'ban',
  'circle-plus',
  'arrow-right',
  'arrow-up-right',
  'refresh-cw',
  'cloud',
  'server',
  'database',
  'cpu',
  'code',
  'wifi',
  'smartphone',
  'laptop',
  'monitor',
  'camera',
  'image',
  'video',
  'music',
  'mic',
  'leaf',
  'sun',
  'moon',
  'droplet',
  'mountain',
  'plane',
  'car',
  'bike',
  'coffee',
  'utensils',
  'gift',
  'puzzle',
  'layers',
  'git-branch',
];

/** An icon drawn small, from its lines. */
export function IconGlyph({ paths, size = 22 }: { paths: IconNode[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths.map(([Tag, a], i) => (
        <Tag key={i} {...(a as Record<string, string | number>)} />
      ))}
    </svg>
  );
}

export function IconPicker({
  open,
  onClose,
  onIcon,
  onEmoji,
  start = 'icons',
  title = 'Insert an icon',
}: {
  open: boolean;
  onClose: () => void;
  onIcon: (icon: IconDef) => void;
  onEmoji?: (ch: string) => void;
  start?: 'icons' | 'emoji';
  title?: string;
}) {
  const [tab, setTab] = useState<'icons' | 'emoji'>(start);
  const [icons, setIcons] = useState<IconDef[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (open) setTab(start);
  }, [open, start]);
  useEffect(() => {
    if (!open || icons) return;
    let alive = true;
    loadIcons()
      .then((list) => alive && setIcons(list))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [open, icons]);
  const shown = useMemo(() => {
    if (!icons) return [];
    const words = q
      .trim()
      .toLowerCase()
      .split(/[\s-]+/)
      .filter(Boolean);
    if (!words.length) {
      const by = new Map(icons.map((i) => [i.name, i]));
      const common = COMMON.map((n) => by.get(n)).filter((x): x is IconDef => !!x);
      const seen = new Set(common.map((i) => i.name));
      return [...common, ...icons.filter((i) => !seen.has(i.name))].slice(0, 240);
    }
    const hits = icons.filter((i) => words.every((w) => i.name.includes(w)));
    // Those whose name starts with what was typed, first.
    return hits.sort((a, b) => Number(!a.name.startsWith(words[0])) - Number(!b.name.startsWith(words[0])) || a.name.length - b.name.length).slice(0, 240);
  }, [icons, q]);
  return (
    <Dialog open={open} onClose={onClose} title={title} width={600}>
      {onEmoji && (
        <div className="mb-3">
          <Segmented
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'icons', label: 'Icons' },
              { value: 'emoji', label: 'Emoji' },
            ]}
          />
        </div>
      )}
      {tab === 'emoji' && onEmoji ? (
        <CharPicker kinds={['emoji']} onPick={(ch) => (onEmoji(ch), onClose())} />
      ) : (
        <>
          <div className="relative mb-2">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && shown[0]) {
                  e.preventDefault();
                  onIcon(shown[0]);
                  onClose();
                }
              }}
              placeholder={icons ? `Find one of ${icons.length.toLocaleString()} icons: arrow, chart, user…` : 'Find an icon: arrow, chart, user…'}
              aria-label="Find an icon"
              spellCheck={false}
              className="h-9 w-full rounded-lg border border-line bg-bg pr-2.5 pl-8 text-[13.5px] text-fg outline-none placeholder:text-fg-3 focus:border-accent"
            />
          </div>
          {!icons && <div className="py-10 text-center text-[13px] text-fg-3">{failed ? 'The icons could not be loaded.' : 'Loading the icons…'}</div>}
          {icons && !shown.length && <div className="py-10 text-center text-[13px] text-fg-3">No icon has that name.</div>}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(46px,1fr))] gap-1">
            {shown.map((i) => (
              <button
                key={i.name}
                type="button"
                title={i.name.replace(/-/g, ' ')}
                aria-label={i.name.replace(/-/g, ' ')}
                onClick={() => {
                  onIcon(i);
                  onClose();
                }}
                className="grid h-11 place-items-center rounded-lg text-fg-2 hover:bg-bg-2 hover:text-fg"
              >
                <IconGlyph paths={i.paths} />
              </button>
            ))}
          </div>
          {icons && shown.length === 240 && <p className="pt-2 text-center text-[12px] text-fg-3">Type to find more.</p>}
        </>
      )}
    </Dialog>
  );
}
