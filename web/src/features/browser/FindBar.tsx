// Find in page: a slim row under the address bar (the page itself may be a native view, which nothing can sit over).
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { enc, post } from '../../lib/api';
import { toastError } from '../../lib/store';
import { cx, IconButton, inputCls } from '../../components/ui';
import { KEY } from './browsing';

const find = (text: string, back = false) => post<{ found: boolean; count: number }>(`/api/browser/sessions/${enc(KEY)}/find`, { text, back });

export function FindBar({ onClose, focusTick }: { onClose: () => void; focusTick: number }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ found: boolean; count: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const last = useRef('');
  // Ctrl or ⌘ + F again while it is open selects what is in it.
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusTick]);
  // Clears the page's selection when it goes.
  useEffect(
    () => () => {
      void find('').catch(() => {});
    },
    [],
  );

  const run = async (back = false, t = text) => {
    if (!t) {
      last.current = '';
      setResult(null);
      return void (await find('').catch(() => {}));
    }
    try {
      last.current = t;
      setResult(await find(t, back));
    } catch (e) {
      toastError(e);
    }
  };
  // Searches as you type, after a short pause; the same words again go to the next match.
  useEffect(() => {
    if (text === last.current) return;
    const t = window.setTimeout(() => void run(false, text), 250);
    return () => window.clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-10 shrink-0 items-center justify-end gap-1.5 border-b border-line bg-bg-1 px-3">
      <input
        ref={input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') return onClose();
          if (e.key === 'Enter') {
            e.preventDefault();
            void run(e.shiftKey);
          }
        }}
        placeholder="Find in page"
        aria-label="Find in page"
        className={cx(inputCls, 'h-7.5 max-w-[260px] text-[13px]')}
      />
      <span className={cx('tnum min-w-[76px] text-[12.5px]', result && !result.found ? 'text-warn' : 'text-fg-3')}>
        {result ? (result.found ? `${result.count >= 1000 ? '1000+' : result.count} match${result.count === 1 ? '' : 'es'}` : 'No matches') : ''}
      </span>
      <IconButton label="Previous match" size="sm" disabled={!text} onClick={() => void run(true)}>
        <ChevronUp size={15} />
      </IconButton>
      <IconButton label="Next match" size="sm" disabled={!text} onClick={() => void run(false)}>
        <ChevronDown size={15} />
      </IconButton>
      <IconButton label="Close" size="sm" onClick={onClose}>
        <X size={15} />
      </IconButton>
    </div>
  );
}
