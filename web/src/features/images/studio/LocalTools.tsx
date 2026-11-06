// The picture tools on this computer: taking a picture's background out, erasing part of it and making it larger here,
// for nothing and in private, instead of through OpenRouter (plots run in the same Python). Set up once (about 145 MB);
// each tool's model downloads the first time it is used (about 200 MB each, the upscaler's 5 MB). While it sets up or a tool works, its state is asked for
// every second, to show what it is doing. The card offers it where a tool would use it, with the other way beside it.
import { useCallback, useEffect, useState } from 'react';
import { Cpu, HardDriveDownload } from 'lucide-react';
import type { LocalToolsState } from '@shared/images';
import { Button } from '../../../components/ui';
import { localState, removeLocal, setUpLocal } from './api';
import { Working } from './parts';
import { errorWords } from './logic';

export interface LocalTools {
  state: LocalToolsState | null;
  error: string | null;
  setUp: () => Promise<void>;
  remove: () => Promise<void>;
  refresh: () => Promise<void>;
}

/** The picture tools' state, asked again every second while they set up or `watch` says a tool is at work. */
export function useLocalTools(watch = false): LocalTools {
  const [state, setState] = useState<LocalToolsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(
    () =>
      localState().then(
        (s) => (setState(s), setError(null)),
        (e: Error) => setError(errorWords(e)),
      ),
    [],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const busy = !!state?.installing || watch;
  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => void localState().then(setState, () => {}), 1000);
    return () => window.clearInterval(t);
  }, [busy]);
  const setUp = async () => {
    setError(null);
    try {
      const s = await setUpLocal();
      setState(s && typeof s === 'object' && 'ready' in s ? s : await localState());
    } catch (e) {
      setError(errorWords(e));
    }
  };
  const remove = async () => {
    setError(null);
    try {
      const s = await removeLocal();
      setState(s && typeof s === 'object' && 'ready' in s ? s : await localState());
    } catch (e) {
      setError(errorWords(e));
    }
  };
  return { state, error, setUp, remove, refresh };
}

/** What they are doing now, or why they are not there: a sentence or two, each whole (so each is translated). */
export function localStatus(s: LocalToolsState): string[] {
  if (s.installing) return [s.step || 'Setting up'];
  if (!s.ready) return [s.canInstall ? 'Not set up.' : (s.why ?? 'This computer cannot set them up.')];
  const d = s.downloaded;
  const out: string[] = [];
  if (!d.length) out.push('Ready. Each tool downloads its model the first time it is used.');
  else if (d.length >= 3) out.push('Ready, with all three models downloaded.');
  else {
    out.push('Ready.');
    if (d.includes('cutout')) out.push('The background remover is downloaded.');
    if (d.includes('erase')) out.push('The eraser is downloaded.');
    if (d.includes('upscale')) out.push('The upscaler is downloaded.');
  }
  const n = s.loaded.length;
  if (n) out.push(n >= 3 ? 'All three models are in memory now; each goes after a few idle minutes.' : n === 2 ? 'Two models are in memory now; each goes after a few idle minutes.' : 'One model is in memory now; it goes after a few idle minutes.');
  return out;
}

/** Offered where a tool would use them: what they are, Set up (with its progress), and the other way (`instead`, through OpenRouter). */
export function LocalToolsCard({ tools, instead }: { tools: LocalTools; instead?: { label: string; run: () => void; disabled?: boolean } }) {
  const s = tools.state;
  return (
    <div className="rounded-xl border border-line bg-bg-1 px-3.5 py-3">
      <div className="flex items-start gap-3">
        <Cpu size={16} className="mt-0.5 shrink-0 text-fg-3" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-[13.5px] font-medium text-fg">The picture tools on this computer</div>
          <p className="text-[12.5px] leading-snug text-fg-3">They take backgrounds out, erase parts of pictures and make pictures larger here: for nothing, and your pictures stay on this computer.</p>
          {!s ? <Working>Looking</Working> : s.installing ? <Working>{s.step || 'Setting up'}</Working> : !s.canInstall ? <p className="text-[12.5px] leading-snug text-fg-2">{s.why ?? 'This computer cannot set them up.'}</p> : null}
          {(tools.error || s?.error) && <p className="text-[12.5px] leading-snug text-err">{tools.error || s?.error}</p>}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2 pl-7">
        {s?.canInstall && !s.installing && !s.ready && (
          <Button size="sm" variant="primary" icon={<HardDriveDownload size={14} />} onClick={() => void tools.setUp()}>
            {`Set up (about ${s.sizeMb} MB, once)`}
          </Button>
        )}
        {instead && (
          <Button size="sm" variant="secondary" disabled={instead.disabled} onClick={instead.run}>
            {instead.label}
          </Button>
        )}
      </div>
    </div>
  );
}
