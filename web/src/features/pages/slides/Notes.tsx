// The speaker notes of a slide, to write: a plain text field with Find's matches marked behind its words (the field
// is see-through, a copy of its words underneath holds the marks), the one on view brought into sight.
import { useLayoutEffect, useRef } from 'react';
import { cx } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';

export function NotesField({ value, onChange, readOnly, marks, className }: { value: string; onChange: (v: string) => void; readOnly?: boolean; marks?: { s: number; e: number; current: boolean }[]; className?: string }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const cur = marks?.find((m) => m.current);
  // The marks scroll with the words, and the one on view comes into sight.
  useLayoutEffect(() => {
    const a = area.current;
    const b = back.current;
    if (!a || !b) return;
    const mark = b.querySelector<HTMLElement>('mark[data-current]');
    if (mark) a.scrollTop = Math.max(0, mark.offsetTop - a.clientHeight / 3);
    b.scrollTop = a.scrollTop;
  }, [cur?.s, cur?.e, value]);
  const parts: { t: string; m?: boolean; c?: boolean }[] = [];
  if (marks?.length) {
    let at = 0;
    for (const m of [...marks].sort((x, y) => x.s - y.s)) {
      if (m.s < at) continue;
      parts.push({ t: value.slice(at, m.s) }, { t: value.slice(m.s, m.e), m: true, c: m.current });
      at = m.e;
    }
    parts.push({ t: value.slice(at) });
  }
  const text = 'block h-full w-full px-3 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words';
  return (
    <div className={cx('relative min-h-0', className)}>
      {marks?.length ? (
        <div ref={back} aria-hidden translate="no" className={cx(text, 'pointer-events-none absolute inset-0 overflow-hidden text-transparent')}>
          {parts.map((p, i) =>
            p.m ? (
              <mark key={i} data-current={p.c || undefined} className={cx('rounded-[2px] text-transparent', p.c ? 'bg-[#ff9f1a]/60' : 'bg-[#ffe066]/50')}>
                {p.t}
              </mark>
            ) : (
              <span key={i}>{p.t}</span>
            ),
          )}
          {'\n'}
        </div>
      ) : null}
      <textarea
        ref={area}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => back.current && (back.current.scrollTop = e.currentTarget.scrollTop)}
        placeholder={tr('What to say on this slide: you see it in the presenter’s view.')}
        translate="no"
        className={cx(text, 'relative resize-none bg-transparent outline-none placeholder:text-fg-3')}
      />
    </div>
  );
}
