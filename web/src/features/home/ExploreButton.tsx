// Explore, at the top right of the start page: the magazine made for you (a ready-made app that opens on its own
// page). A dot on it says a new edition is ready that you haven't opened. Gone while Explore is uninstalled.
import { useEffect, useState } from 'react';
import { Compass } from 'lucide-react';
import { api } from '../../lib/api';
import { go } from '../../lib/nav';
import { cx } from '../../components/ui';
import { appPath, type AppDetail } from '../apps/api';

export const EXPLORE_ID = 'tpl:explore';
const SEEN = 'wa.explore.seen';

/** Opening Explore's page marks its latest edition seen (on this device). */
export function sawExplore() {
  try {
    localStorage.setItem(SEEN, String(Date.now()));
  } catch {}
}

export function ExploreButton() {
  const [state, setState] = useState<{ installed: boolean; fresh: boolean } | null>(null);
  useEffect(() => {
    let off = false;
    api<AppDetail>(`/api/apps/${encodeURIComponent(EXPLORE_ID)}`).then(
      (d) => {
        if (off) return;
        const seen = Number(localStorage.getItem(SEEN) ?? 0);
        setState({ installed: d.installed !== false, fresh: !!d.latest && d.latest > seen });
      },
      () => !off && setState({ installed: false, fresh: false }),
    );
    return () => {
      off = true;
    };
  }, []);
  if (!state?.installed) return null;
  return (
    <button
      type="button"
      data-tour="explore"
      onClick={() => go(appPath(EXPLORE_ID))}
      title={state.fresh ? 'A new edition of Explore is ready' : 'Explore: articles and news picked for you'}
      className={cx(
        'relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-panel px-3.5 text-[13.5px] font-medium text-fg-2 transition-colors hover:border-fg/25 hover:text-fg',
      )}
    >
      <Compass size={16} className="text-accent" />
      Explore
      {state.fresh && <span aria-hidden className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-bg" />}
    </button>
  );
}
