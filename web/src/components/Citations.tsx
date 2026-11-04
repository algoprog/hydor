// The sources a reply cites (shared/citations.ts): each run of numbers in its text ("[1][3]") a small chip naming
// the site, which opens a card with the pages it stands for (on a computer as the pointer rests on it; a click on a
// chip of one page opens that page), and the reply's list of sources as cards under it, folded into one line until
// opened. Only the pages the reply cites: not every search the agent ran.
import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { shortSite, siteOfUrl, type Cited } from '@shared/citations';
import { cx, Popover, useMediaQuery } from './ui';

/** Sites whose icon did not come: their letter from then on, without asking again. */
const noIcon = new Set<string>();

/** A site's own icon (the app keeps a copy of each), or its first letter when it has none. */
export function SiteIcon({ url, size = 14, className }: { url: string; size?: number; className?: string }) {
  const host = siteOfUrl(url).toLowerCase();
  const ok = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host);
  const [failed, setFailed] = useState(() => !ok || noIcon.has(host));
  if (failed)
    return (
      <span aria-hidden style={{ width: size, height: size, fontSize: Math.round(size * 0.62) }} className={cx('inline-grid shrink-0 place-items-center rounded-[4px] bg-bg-3 leading-none font-semibold text-fg-2 uppercase', className)}>
        {shortSite(url).charAt(0) || '·'}
      </span>
    );
  return (
    <img
      src={`/api/site-icon/${encodeURIComponent(host)}`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      onError={() => {
        noIcon.add(host);
        setFailed(true);
      }}
      className={cx('shrink-0 rounded-[4px] object-contain', className)}
    />
  );
}

/** One page in a card or the list: its icon, its title (its address when it has none) and its site. */
function SourceLink({ s, wide }: { s: Cited; wide?: boolean }) {
  const site = siteOfUrl(s.url);
  const title = s.title || s.url.replace(/^[a-z]+:\/\/(www\.)?/i, '').replace(/\/$/, '');
  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" className={cx('group/s flex min-w-0 items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-bg-2', wide && 'border border-line bg-panel')}>
      <SiteIcon url={s.url} size={16} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span translate="no" className="line-clamp-2 text-[13px] leading-snug text-fg group-hover/s:text-accent">
          {title}
        </span>
        <span translate="no" className="block truncate text-[11.5px] text-fg-3">
          {site}
        </span>
      </span>
    </a>
  );
}

/** A run of citing numbers in a reply's text, as one chip: the first page's site, and how many more. */
export function CiteChip({ sources }: { sources: Cited[] }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const hover = useMediaQuery('(hover: hover) and (pointer: fine)');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  if (!sources.length) return null;
  const later = (v: boolean, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(v), ms);
  };
  const first = sources[0];
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={`Source: ${sources.map((s) => s.title || siteOfUrl(s.url)).join('; ')}`}
        onClick={(e) => {
          e.preventDefault();
          // On a computer the card is already showing: one page opens, several stay in the card.
          if (hover && sources.length === 1) {
            window.open(first.url, '_blank', 'noopener,noreferrer');
            return;
          }
          setOpen((o) => !o);
        }}
        onMouseEnter={() => hover && later(true, 160)}
        onMouseLeave={() => hover && later(false, 220)}
        className={cx(
          'cite-chip mx-0.5 inline-flex max-w-[11rem] translate-y-[-1px] items-center gap-1 rounded-full bg-bg-2 py-px pr-1.5 pl-1 align-middle text-[11.5px] leading-[18px] font-normal text-fg-2 transition-colors hover:bg-bg-3 hover:text-fg',
          open && 'bg-bg-3 text-fg',
        )}
      >
        <SiteIcon url={first.url} size={12} />
        <span translate="no" className="truncate">
          {shortSite(first.url)}
        </span>
        {sources.length > 1 && <span className="shrink-0 text-fg-3">+{sources.length - 1}</span>}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={320} prefer="above">
        <div onMouseEnter={() => hover && later(true, 0)} onMouseLeave={() => hover && later(false, 220)} className="space-y-0.5">
          {sources.map((s) => (
            <SourceLink key={`${s.n}-${s.url}`} s={s} />
          ))}
        </div>
      </Popover>
    </>
  );
}

/** A reply's sources under it: one line with their icons, opening to a card for each. */
export function SourcesRow({ sources }: { sources: Cited[] }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;
  const icons = [...new Map(sources.map((s) => [siteOfUrl(s.url), s])).values()].slice(0, 3);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-tip="sources"
        className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-panel py-1 pr-2 pl-1.5 text-[12.5px] transition-colors hover:bg-bg-2"
      >
        <span className="flex shrink-0 items-center gap-0.5">
          {icons.map((s) => (
            <SiteIcon key={s.url} url={s.url} size={14} />
          ))}
        </span>
        <span className="font-medium text-fg-2">Sources</span>
        <span className="text-fg-3">{sources.length}</span>
        <ChevronRight size={13} className={cx('shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {sources.map((s) => (
            <SourceLink key={`${s.n}-${s.url}`} s={s} wide />
          ))}
        </div>
      )}
    </div>
  );
}
