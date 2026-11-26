// Settings → General → Lean (proof checker): how Lean stands on this computer, Set up (its size said first), then
// Add Mathlib, and Remove in the row's menu (the app's own only: your own Lean is never changed). The state is
// asked again while something installs (server/lean).
import { useCallback, useEffect, useState } from 'react';
import { Check, HardDriveDownload, Sigma, Square, Trash2 } from 'lucide-react';
import type { LeanState } from '@shared/lean';
import { trIn } from '../../i18n/runtime';
import { api, del, post } from '../../lib/api';
import { Button, cx, MenuItem, Throbber, useConfirm } from '../../components/ui';
import { MoreMenu, Row } from '../settings/kit';

const size = (mb: number) => (mb >= 1000 ? `${(mb / 1000).toFixed(0)} GB` : `${mb} MB`);

function useLean() {
  const [state, setState] = useState<LeanState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const take = (s: LeanState) => (setState(s), setError(null));
  const failed = (e: Error) => setError(e.message);
  const refresh = useCallback(() => api<LeanState>('/api/lean').then(take, failed), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  // While it installs; and once more where your own Lean's version is still being asked.
  const busy = !!state?.installing;
  const unnamed = !!state?.ready && !state.version;
  useEffect(() => {
    if (!busy && !unnamed) return;
    const t = window.setInterval(() => void refresh(), busy ? 1500 : 4000);
    return () => window.clearInterval(t);
  }, [busy, unnamed, refresh]);
  return {
    state,
    error,
    setUp: (mathlib: boolean) => post<LeanState>('/api/lean/setup', mathlib ? { mathlib: true } : {}).then(take, failed),
    remove: (mathlib: boolean) => del<LeanState>(`/api/lean${mathlib ? '?mathlib=1' : ''}`).then(take, failed),
  };
}

export function LeanSetting() {
  const { state: s, error, setUp, remove } = useLean();
  const [confirm, confirmNode] = useConfirm();
  const ownLean = !!s?.own;
  const hasMathlib = !!s && s.mathlib !== 'none';
  // What the app has of its own, which Remove takes away.
  const removable = !!s && (hasMathlib || (s.ready && !ownLean));

  const addMathlib = async () => {
    if (!s) return;
    const ok = await confirm({
      title: 'Add Mathlib?',
      body: `Mathlib is the library most mathematics needs. It is a large download of several GB, about ${size(s.mathlibSizeMb)} on this computer once it is there, and it takes a while.${s.own ? ' Your own Lean gets the version Mathlib asks for, as any Mathlib project would.' : ''}`,
      confirm: 'Add Mathlib',
    });
    if (ok) await setUp(true);
  };
  const removeIt = async (mathlibOnly: boolean) => {
    const ok = await confirm({
      title: mathlibOnly ? 'Remove Mathlib?' : 'Remove Lean?',
      body: mathlibOnly
        ? 'Mathlib goes from this computer. Proofs that import it can’t be checked until you add it again.'
        : ownLean
          ? 'Mathlib, which the app added, goes from this computer. Your own Lean stays as it is.'
          : 'The Lean this app set up goes from this computer, and Mathlib with it. Agents can’t check proofs until you set it up again.',
      confirm: trIn('lean', 'Remove'),
      danger: true,
    });
    if (ok) await remove(mathlibOnly || ownLean);
  };

  const status: string[] = !s
    ? []
    : s.ready
      ? [
          s.own ? 'Using your own Lean' : 'Ready',
          ...(s.version ? [`Lean ${s.version}`] : []),
          s.mathlib === 'ready' ? 'with Mathlib' : 'without Mathlib',
        ]
      : s.canInstall
        ? [`A download of about ${size(s.sizeMb)}, about 3 GB on this computer`]
        : [s.why ?? 'Lean can’t be set up on this computer.'];

  return (
    <Row
      icon={<Sigma size={16} />}
      label="Lean (proof checker)"
      hint="Lets agents check mathematical proofs: a proof Lean accepts is correct"
      info="Your own Lean is used if you have one, and never changed. Otherwise the app keeps its own, apart from the rest of your computer. Mathlib, the library most mathematics needs, is a second, much larger download. A project that asks for another version of Lean downloads that version the first time."
      control={
        !s ? (
          <Throbber className="text-fg-3" />
        ) : (
          <div className="flex items-center gap-1.5">
            {!s.installing && !s.ready && s.canInstall && (
              <Button size="sm" variant="secondary" icon={<HardDriveDownload size={14} />} onClick={() => void setUp(false)}>
                {trIn('lean', 'Set up')}
              </Button>
            )}
            {!s.installing && s.ready && s.mathlib === 'none' && (
              <Button size="sm" variant="secondary" icon={<HardDriveDownload size={14} />} onClick={() => void addMathlib()}>
                Add Mathlib
              </Button>
            )}
            {(s.installing || removable) && (
              <MoreMenu label="More about Lean">
                {(close) => (
                  <>
                    {s.installing ? (
                      <MenuItem
                        icon={<Square size={15} />}
                        onClick={() => {
                          close();
                          void remove(s.mathlib === 'installing' && s.ready);
                        }}
                      >
                        Stop setting up
                      </MenuItem>
                    ) : (
                      <>
                        {hasMathlib && !ownLean && (
                          <MenuItem
                            danger
                            icon={<Trash2 size={15} />}
                            onClick={() => {
                              close();
                              void removeIt(true);
                            }}
                          >
                            Remove Mathlib
                          </MenuItem>
                        )}
                        <MenuItem
                          danger
                          icon={<Trash2 size={15} />}
                          onClick={() => {
                            close();
                            void removeIt(false);
                          }}
                        >
                          {trIn('lean', 'Remove')}
                        </MenuItem>
                      </>
                    )}
                  </>
                )}
              </MoreMenu>
            )}
          </div>
        )
      }
    >
      {s?.installing ? (
        <div className="flex items-start gap-2 text-[12.5px] text-fg-2">
          <Throbber className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words" translate="no">{s.step || trIn('lean', 'Setting up')}</span>
        </div>
      ) : (
        s && (
          <div className={cx('flex flex-wrap gap-x-1.5 text-[12.5px]', s.ready ? 'text-fg-2' : 'text-fg-3')}>
            {s.ready && <Check size={14} className="mt-px shrink-0 text-ok" strokeWidth={2.6} />}
            {status.map((x) => (
              <span key={x}>{x}</span>
            ))}
          </div>
        )
      )}
      {!s?.installing && (error || s?.error) && (
        <p className="mt-1 max-h-32 overflow-auto text-[12.5px] leading-snug break-words whitespace-pre-line text-err" translate="no">
          {error || s?.error}
        </p>
      )}
      {confirmNode}
    </Row>
  );
}
