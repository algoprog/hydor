// Settings → Images, video and audio → Use the graphics card for videos: Automatic (the video editor and agents' edits
// make MP4 and MOV videos on the graphics card when there is one that works, the processor otherwise) or Off; with what
// was found ("NVIDIA GeForce RTX 4090 · NVENC"), and Check now. The card is tried the first time a video is made, never
// when the app starts (server/mediaedit/video-gpu.ts).
import { useEffect, useState } from 'react';
import { Check, Cpu, Gpu } from 'lucide-react';
import { api, post, put } from '../../../lib/api';
import { toastError } from '../../../lib/store';
import { Button, Segmented, Throbber } from '../../../components/ui';
import { Row } from '../../settings/kit';

interface GpuState {
  mode: 'auto' | 'off';
  forcedOff?: boolean;
  checked: boolean;
  checking?: boolean;
  found: { label: string } | null;
  broken?: string[];
}

export function GpuSetting() {
  const [s, setS] = useState<GpuState | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    api<GpuState>('/api/videos/gpu').then(setS, toastError);
  }, []);
  const set = (mode: 'auto' | 'off') => put<GpuState>('/api/videos/gpu', { mode }).then(setS, toastError);
  const check = () => {
    setChecking(true);
    post<GpuState>('/api/videos/gpu/check')
      .then(setS, toastError)
      .finally(() => setChecking(false));
  };
  const words = !s
    ? null
    : s.forcedOff
      ? 'Turned off on this computer (HYDOR_VIDEO_GPU=off): videos are made on the processor.'
      : s.mode === 'off'
        ? 'Off: videos are made on the processor.'
        : s.found
          ? `${s.found.label}${s.broken?.length ? ': it failed an edit, so the processor makes them until the app starts again' : ''}`
          : s.checked
            ? 'No graphics card that makes videos was found: they are made on the processor.'
            : 'Not tried yet: the first video you make tries it.';
  return (
    <Row
      icon={<Gpu size={16} />}
      label="Use the graphics card for videos"
      hint={
        !s || checking ? (
          <span className="flex items-center gap-2">
            <Throbber /> {checking ? 'Trying the graphics card' : 'Looking'}
          </span>
        ) : (
          <span className="flex items-start gap-1.5">
            {s.found && s.mode === 'auto' && !s.forcedOff ? <Check size={14} className="mt-px shrink-0 text-ok" strokeWidth={2.6} /> : <Cpu size={14} className="mt-px shrink-0" />}
            <span translate="no">{words}</span>
          </span>
        )
      }
      info="The video editor and agents’ video edits make MP4 and MOV videos on the graphics card when there is one that works (NVIDIA, Intel, AMD or Apple): much faster, and the processor stays free. If the card fails, the processor makes the video at once."
      control={
        s &&
        !s.forcedOff && (
          <>
            {s.mode === 'auto' && (
              <Button size="sm" variant="ghost" disabled={checking} onClick={check}>
                Check now
              </Button>
            )}
            <Segmented<'auto' | 'off'>
              size="sm"
              value={s.mode}
              onChange={(m) => void set(m)}
              options={[
                { value: 'auto', label: 'Automatic' },
                { value: 'off', label: 'Off' },
              ]}
            />
          </>
        )
      }
    />
  );
}
