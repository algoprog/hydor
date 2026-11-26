// A tag as the Jobs page shows it: its dot in the tag's colour (tags.ts), and the small pill with its name.
import { cx } from '../../components/ui';
import { tagTone } from './tags';

/** A tag's dot; hollow for the jobs with no tag. */
export function TagDot({ tag, className }: { tag: string | null; className?: string }) {
  return <span aria-hidden className={cx('inline-block h-2 w-2 shrink-0 rounded-full', tag === null && 'border border-fg-3', className)} style={tag === null ? undefined : { background: tagTone(tag) }} />;
}

export function TagPills({ tags }: { tags: string[] }) {
  return (
    <>
      {tags.map((t) => (
        <span key={t} translate="no" className="inline-flex h-4.5 max-w-44 shrink-0 items-center gap-1 rounded-md bg-bg-2 px-1.5 text-[11.5px] leading-none font-normal text-fg-2">
          <TagDot tag={t} className="!h-1.5 !w-1.5" />
          <span className="truncate">{t}</span>
        </span>
      ))}
    </>
  );
}
