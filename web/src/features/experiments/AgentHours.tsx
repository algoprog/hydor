// The limit on agents' GPU hours, as the pages show it: the box in Where runs go that sets it, and the quiet line under
// the GPUs once more than four fifths of it is used.
import { useEffect, useRef, useState } from 'react';
import { gpuNum, type QueueNow } from '@shared/experiments';
import { cx, inputCls } from '../../components/ui';
import { put } from '../../lib/api';
import { toastError } from '../../lib/store';

/** "Agents' runs: at most [ ] GPU hours in seven days", empty for no limit. Saved a moment after the last key, or on leaving the box. */
export function AgentHoursLimit({ value }: { value: number | null }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const typed = useRef<{ v?: string; timer?: number }>({});
  useEffect(() => setText(value === null ? '' : String(value)), [value]);
  const save = () => {
    window.clearTimeout(typed.current.timer);
    const v = typed.current.v;
    typed.current = {};
    if (v === undefined) return;
    const n = v.trim() === '' ? null : Number(v);
    if (n !== null && !Number.isFinite(n)) return;
    put('/api/experiments/settings', { agentGpuHours: n }).catch(toastError);
  };
  const change = (v: string) => {
    const clean = v.replace(/,/g, '.').replace(/[^\d.]/g, '').slice(0, 7);
    setText(clean);
    window.clearTimeout(typed.current.timer);
    typed.current = { v: clean, timer: window.setTimeout(save, 1200) };
  };
  // Closing the dialog keeps what was typed.
  useEffect(() => save, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <label className="flex flex-wrap items-center gap-2 text-fg-2">
        Agents’ runs: at most
        <input value={text} onChange={(e) => change(e.target.value)} onBlur={save} inputMode="decimal" placeholder="no limit" aria-label="GPU hours agents’ runs may use in seven days, empty for no limit" className={cx(inputCls.replace('w-full', ''), 'tnum h-8 w-[5.5rem] text-[13px]')} />
        GPU hours in seven days
      </label>
      <p className="mt-1 leading-relaxed text-fg-3">Runs you start yourself are never held back.</p>
    </div>
  );
}

/** "Agents: 92 of 100 GPU hours in seven days", only when a limit is set and more than four fifths of it is used. */
export function AgentHoursLine({ queue }: { queue: QueueNow | null }) {
  const a = queue?.agents;
  if (!a || a.ceiling === undefined || a.used <= a.ceiling * 0.8) return null;
  return <p className={cx('tnum text-[12px] leading-snug', a.used >= a.ceiling ? 'text-warn' : 'text-fg-3')}>{`Agents: ${gpuNum(a.used, true)} of ${gpuNum(a.ceiling)} GPU hours in seven days`}</p>;
}
