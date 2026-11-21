// Settings → Capabilities → Goals: what a new goal starts from. The agreement card, the bar's chip and Set a goal change
// these for one goal; here are the defaults for every new one.
import { useEffect } from 'react';
import { Segmented, Throbber } from '../../components/ui';
import { Group, Row, Stack } from '../settings/kit';
import { loadGoalDefaults, saveGoalDefaults, useGoalDefaultsState } from './defaults';
import { ASKS } from './words';

const ROUNDS = [10, 30, 100];
const MINUTES = [0, 5, 10, 30, 60];

/** The presets, and the number set now when it is none of them (the API takes any from the range). */
const withCurrent = (presets: number[], now: number): number[] => (presets.includes(now) ? presets : [...presets, now].sort((a, b) => a - b));

export function GoalsSettingsBody() {
  const d = useGoalDefaultsState((s) => s.d);
  useEffect(() => {
    loadGoalDefaults(true);
  }, []);
  const wait = <Throbber className="text-fg-3" />;
  return (
    <Stack>
      <Group
        title="Goals"
        info="A goal works round after round until checks you agree hold. These are what a new goal starts from, for every agent; you can change them for one goal when you set it, when you agree its checks, or from its bar."
      >
        <Row
          label="Rounds a goal may run"
          hint="How many rounds a new goal gets before it stops at its limit, unless the agent proposes fewer or you change it when you agree"
          info="A goal that runs out of rounds stops, and you can give it more."
          control={
            d ? (
              <Segmented size="sm" value={String(d.rounds)} options={withCurrent(ROUNDS, d.rounds).map((v) => ({ value: String(v), label: String(v) }))} onChange={(v) => void saveGoalDefaults({ rounds: Number(v) })} />
            ) : (
              wait
            )
          }
        />
        <Row
          label="How much a goal asks you"
          hint={d ? ASKS.find((a) => a.value === d.asks)?.hint : undefined}
          control={d ? <Segmented size="sm" value={d.asks} options={ASKS.map((a) => ({ value: a.value, label: a.chip }))} onChange={(asks) => void saveGoalDefaults({ asks })} /> : wait}
        />
        <Row
          label="Goes on with its own pick after"
          hint="When a question about which way to go is not answered. A check only you can confirm, or something only you can give, always waits"
          info="Minutes. Waits for you means it asks and does nothing more until you answer."
          control={
            d ? (
              <Segmented
                size="sm"
                value={String(d.noAnswerMin)}
                options={withCurrent(MINUTES, d.noAnswerMin).map((v) => ({ value: String(v), label: v === 0 ? 'Waits for you' : `${v} min` }))}
                onChange={(v) => void saveGoalDefaults({ noAnswerMin: Number(v) })}
              />
            ) : (
              wait
            )
          }
        />
      </Group>
    </Stack>
  );
}
