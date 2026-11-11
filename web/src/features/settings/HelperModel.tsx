// The helper model: what the app uses for small jobs outside sessions (memory notes after a turn, Auto
// mode's checks, second opinions, reading a page for one question).
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { toastError } from '../../lib/store';
import { OptionRow, Picker, Throbber } from '../../components/ui';
import { Group, Row } from './kit';

interface HelperState {
  model: string;
  options: { value: string; label: string; detail?: string; vision?: boolean }[];
}

export function HelperModel() {
  const [st, setSt] = useState<HelperState | null>(null);
  useEffect(() => {
    api<HelperState>('/api/helper')
      .then(setSt)
      .catch(() => {});
  }, []);
  const cur = st && (st.options.find((o) => o.value === st.model) ?? st.options[0]);
  const pick = (model: string) => api<HelperState>('/api/helper', { method: 'PUT', body: { model } }).then(setSt).catch(toastError);
  return (
    <Group title="Helper model" info="The model for the app’s small jobs beside your sessions: writing memory notes, checking steps in Auto mode, second opinions, reading a page for one question.">
      <Row
        label="Model"
        hint={
          <>
            <div>For small jobs beside your sessions: memory notes, checks in Auto mode, second opinions</div>
            {cur?.detail && (
              <div className="mt-0.5" translate="no">
                {cur.detail}
              </div>
            )}
          </>
        }
        control={
          st ? (
            <Picker icon={<Sparkles size={14} className="text-fg-3" />} value={cur?.label ?? 'Automatic'} title="The helper model" width={300}>
              {(close) =>
                st.options.map((o) => (
                  <OptionRow
                    key={o.value}
                    label={o.label}
                    hint={[o.detail, o.vision ? 'sees images' : ''].filter(Boolean).join(' · ')}
                    selected={o.value === st.model}
                    onClick={() => {
                      close();
                      void pick(o.value);
                    }}
                  />
                ))
              }
            </Picker>
          ) : (
            <Throbber className="text-fg-3" />
          )
        }
      />
    </Group>
  );
}
