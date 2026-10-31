// The helper model: what the app uses for small jobs outside sessions (memory notes after a turn, Auto
// mode's checks, second opinions, reading a page for one question).
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { toastError } from '../../lib/store';
import { OptionRow, Picker, Section } from '../../components/ui';

interface HelperState {
  model: string;
  options: { value: string; label: string; detail?: string; vision?: boolean }[];
}

export function HelperModel() {
  const [st, setSt] = useState<HelperState | null>(null);
  useEffect(() => {
    api<HelperState>('/api/helper').then(setSt).catch(() => {});
  }, []);
  if (!st) return null;
  const cur = st.options.find((o) => o.value === st.model) ?? st.options[0];
  const pick = (model: string) =>
    api<HelperState>('/api/helper', { method: 'PUT', body: { model } })
      .then(setSt)
      .catch(toastError);
  return (
    <Section
      title="Helper model"
      sub="For small jobs beside your sessions: writing memory notes, checking steps in Auto mode, second opinions, reading a page for one question."
      actions={
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
      }
    >
      <p className="text-[12.5px] text-fg-3">{cur?.detail ?? ''}</p>
    </Section>
  );
}
