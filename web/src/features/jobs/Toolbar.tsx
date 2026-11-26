// The Jobs page's tag chips and search field. The picked chip is in the address (/jobs?tag=…, /jobs?untagged=1); the
// words searched for are not.
import type { RefObject } from 'react';
import { Search, X } from 'lucide-react';
import { Chip, ScrollRow } from '../spaces/memory/ui';
import { enc } from '../../lib/api';
import { go } from '../../lib/nav';
import type { JobFilter, tagChips } from './tags';
import { TagDot } from './TagPill';

/** Picks a chip: the tag's, "No tag", or All (neither). */
export function pickTag(pick: Pick<JobFilter, 'tag' | 'untagged'>) {
  go(pick.tag ? `/jobs?tag=${enc(pick.tag)}` : pick.untagged ? '/jobs?untagged=1' : '/jobs');
}

export function Toolbar({
  chips,
  atWork,
  tag,
  untagged,
  query,
  onQuery,
  input,
}: {
  chips: ReturnType<typeof tagChips>;
  /** Running and queued, whatever their tags. */
  atWork: number;
  tag?: string;
  untagged?: boolean;
  query: string;
  onQuery: (q: string) => void;
  input: RefObject<HTMLInputElement | null>;
}) {
  // A tag from the address that no job in the list has still shows, so it can be let go of.
  const tags = tag && !chips.tags.some((t) => t.name === tag) ? [...chips.tags, { name: tag, atWork: 0, total: 0, lastAt: 0 }] : chips.tags;
  const none = untagged && !tag;
  return (
    <div className="flex min-w-0 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        {/* With no tag anywhere there is nothing to choose between. */}
        {(tags.length > 0 || none) && (
          <ScrollRow show={tag ?? (none ? '·none' : '·all')}>
            <Chip on={!tag && !none} onClick={() => pickTag({})} count={atWork}>
              All
            </Chip>
            {tags.map((t) => (
              <Chip key={t.name} on={tag === t.name} onClick={() => pickTag({ tag: t.name })} count={t.atWork}>
                <TagDot tag={t.name} />
                <span translate="no">{t.name}</span>
              </Chip>
            ))}
            {(chips.untagged.total > 0 || none) && (
              <Chip on={!!none} onClick={() => pickTag({ untagged: true })} count={chips.untagged.atWork}>
                <TagDot tag={null} className={none ? '!border-bg' : undefined} />
                <span>No tag</span>
              </Chip>
            )}
          </ScrollRow>
        )}
      </div>
      <div className="relative shrink-0 sm:w-56">
        <Search size={14} aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
        <input
          ref={input}
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Escape' || !query) return;
            e.stopPropagation();
            onQuery('');
          }}
          placeholder="Filter jobs"
          aria-label="Filter jobs"
          enterKeyHint="search"
          className="h-8 w-full rounded-[10px] border border-line-2 bg-bg-1 pr-8 pl-8 text-[13px] text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent/60 focus:ring-3 focus:ring-accent/15 max-sm:h-9 max-sm:text-[16px]"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear the filter"
            title="Clear the filter"
            onClick={() => {
              onQuery('');
              input.current?.focus();
            }}
            className="absolute top-1/2 right-1 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-3 hover:bg-bg-2 hover:text-fg"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
