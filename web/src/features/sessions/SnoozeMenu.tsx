// When a snoozed session comes back: a few common times, or a date and time of your own.
import { useState } from 'react';
import { AlarmClock } from 'lucide-react';
import type { SessionSummary } from '@shared/types';
import { setFlags, whenLabel } from '../../lib/flags';
import { Button, inputCls, MenuItem, MenuLabel } from '../../components/ui';

function at(daysAhead: number, hour: number): number {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

/** The choices, soonest first; today's evening only while it is still ahead. */
export function snoozeOptions(now = new Date()): { label: string; until: number }[] {
  const out = [
    { label: 'For an hour', until: now.getTime() + 3600_000 },
    { label: 'For 3 hours', until: now.getTime() + 3 * 3600_000 },
  ];
  if (now.getHours() < 17) out.push({ label: 'This evening', until: at(0, 18) });
  out.push({ label: 'Tomorrow morning', until: at(1, 9) });
  const toMonday = ((8 - now.getDay()) % 7 || 7) as number;
  out.push({ label: 'Next week', until: at(toMonday, 9) });
  return out;
}

/** Menu rows for a session's menu: snooze options, or "Unsnooze" while snoozed. A submenu with a title
 * of its own leaves out the heading. */
export function SnoozeItems({ s, onDone, heading = true }: { s: SessionSummary; onDone: () => void; heading?: boolean }) {
  const [custom, setCustom] = useState(false);
  const [value, setValue] = useState(() => {
    const d = new Date(at(1, 9));
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  if (s.snoozedUntil)
    return (
      <MenuItem
        icon={<AlarmClock size={15} />}
        onClick={() => {
          setFlags(s, { snoozedUntil: null });
          onDone();
        }}
      >
        Unsnooze (back at {whenLabel(s.snoozedUntil)})
      </MenuItem>
    );
  if (custom)
    return (
      <form
        className="space-y-2 px-2 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const until = new Date(value).getTime();
          if (!(until > Date.now())) return;
          setFlags(s, { snoozedUntil: until });
          onDone();
        }}
      >
        <input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className={inputCls.replace('h-9.5', 'h-8') + ' text-[13px]'} autoFocus />
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" type="button" onClick={() => setCustom(false)}>
            Back
          </Button>
          <Button size="sm" variant="primary" type="submit">
            Snooze
          </Button>
        </div>
      </form>
    );
  return (
    <>
      {heading && <MenuLabel>Snooze until later</MenuLabel>}
      {snoozeOptions().map((o) => (
        <MenuItem
          key={o.label}
          icon={<AlarmClock size={15} />}
          onClick={() => {
            setFlags(s, { snoozedUntil: o.until });
            onDone();
          }}
        >
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span>{o.label}</span>
            <span className="ml-auto text-[11.5px] text-fg-3">{whenLabel(o.until)}</span>
          </span>
        </MenuItem>
      ))}
      <MenuItem icon={<AlarmClock size={15} />} onClick={() => setCustom(true)}>
        Pick a date and time…
      </MenuItem>
    </>
  );
}
