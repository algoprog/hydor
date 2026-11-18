// Help's column on a computer, the same kind as the Library's: Help home, then every topic of the guide as a row with
// its icon, under a label for each group the home shows them in. The open one is marked.
import { useEffect, useRef, type ReactNode } from 'react';
import type { GuideTopic } from '@shared/guide';
import { CircleHelp } from 'lucide-react';
import { PlaceRow, PlacesLabel } from '../layout/PlaceRow';
import { GROUPS, lookOf, rankOf } from './topics';

export function HelpPlaces({ topics, current, onHome, onOpen }: { topics: GuideTopic[] | null; current: string | null; onHome: () => void; onOpen: (t: string) => void }) {
  const nav = useRef<HTMLElement>(null);
  // The open topic stays in view in a long list.
  useEffect(() => {
    nav.current?.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest' });
  }, [current, !!topics]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = GROUPS.map((g) => ({ ...g, topics: (topics ?? []).filter((t) => lookOf(t.id).group === g.id).sort((a, b) => rankOf(a.id) - rankOf(b.id)) })).filter((g) => g.topics.length);
  const row = (t: GuideTopic): ReactNode => {
    const Icon = lookOf(t.id).icon;
    return <PlaceRow key={t.id} on={current === t.id} icon={<Icon size={15} className="text-fg-3" />} label={t.title} onClick={() => onOpen(t.id)} />;
  };
  return (
    <nav ref={nav} aria-label="Topics in Help" className="space-y-0.5">
      <PlaceRow on={current === null} icon={<CircleHelp size={15} className="text-fg-3" />} label="Help home" onClick={onHome} />
      {groups.map((g) => (
        <div key={g.id} className="space-y-0.5">
          <PlacesLabel>{g.title}</PlacesLabel>
          {g.topics.map(row)}
        </div>
      ))}
    </nav>
  );
}
