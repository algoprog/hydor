// A web app's card on the Apps page: the same face as an agent app's (its tile, its name, a line of what it is), with how it signs
// people in and what it keeps in a few words, whether it is running, and Open. Marked as a web app by its tile and by the words under its name.
import { AppWindow, Layers } from 'lucide-react';
import type { WebApp } from '@shared/webapps';
import { tr } from '../../i18n/runtime';
import { Button, cx } from '../../components/ui';
import { go } from '../../lib/nav';
import { AppIcon } from '../apps/AppIcon';
import { openWebApp, webAppPath } from './api';
import { StatusLabel } from './StatusLabel';
import { reachWords, shortState } from './simple/plain';
import { useUI } from '../../lib/store';
import { readable, statusOf } from './status';

/** What an app is made of, in a few words: who signs people in, its database, the services it calls. */
export function ownWords(a: WebApp): string {
  const s = a.shape;
  const calls = [s.services.ai && tr('a model'), s.services.embed && tr('search by meaning'), s.services.mail && tr('mail')].filter(Boolean);
  return [s.signIn === 'hydor' ? tr('Sign-in by Hydor') : tr('Its own accounts'), s.database ? (s.database.sqlite ? 'SQLite' : s.database.file) : '', calls.length ? calls.join(', ') : ''].filter(Boolean).join(' · ');
}

export function WebAppCard({ a, first }: { a: WebApp; first?: boolean }) {
  const technical = useUI((s) => s.technicalDetails);
  const st = technical ? statusOf(a) : shortState(a);
  const canOpen = readable(a) && (a.build.exists || a.mode?.runsAs === 'dev') && a.build.state !== 'building';
  return (
    <div
      className={cx(
        'group relative flex h-full w-full flex-col bg-panel text-left transition-colors hover:bg-bg-1 max-sm:px-4 max-sm:py-3 sm:rounded-2xl sm:border sm:border-line sm:p-4 sm:hover:border-line-2',
        first && 'max-sm:bg-bg-1 sm:border-accent/50 sm:ring-1 sm:ring-accent/30',
      )}
    >
      {/* The whole card opens its page; Open sits above it. */}
      <button type="button" aria-label={a.name} onClick={() => go(webAppPath(a.id))} className="absolute inset-0 z-0 cursor-pointer rounded-[inherit] focus-visible:outline-2 focus-visible:outline-accent" />
      <div className="pointer-events-none flex w-full items-start gap-3 max-sm:items-center">
        <AppIcon icon="app-window" color="indigo" size={40} />
        <div className="min-w-0 flex-1">
          <div translate="no" className="truncate text-[15px] font-semibold tracking-tight">
            {a.name}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[13px] leading-snug text-fg-3">
            <AppWindow size={13} aria-hidden className="shrink-0" />
            <span className="truncate">
              {tr('Web app')}
              <span className="sm:hidden"> · {tr(st.label)}</span>
            </span>
          </div>
        </div>
      </div>
      <div className="pointer-events-none mt-3 flex w-full min-w-0 items-center gap-1.5 text-[12.5px] text-fg-3 max-sm:hidden">
        <Layers size={13} className="shrink-0 opacity-80" aria-hidden />
        {!technical ? (
          <span className="truncate" translate="no">
            {reachWords(a)}
          </span>
        ) : st.label === 'Being made' ? (
          <span className="truncate">{tr('Its agent is building it')}</span>
        ) : !readable(a) ? (
          // What is wrong with its files, as the server says it.
          <span translate="no" className="truncate">
            {a.shape.problem}
          </span>
        ) : (
          <span className="truncate" translate="no">
            {ownWords(a)}
          </span>
        )}
      </div>
      <div className="mt-auto flex w-full min-w-0 items-center gap-2 pt-2.5 max-sm:hidden">
        <span className="pointer-events-none min-w-0 flex-1">
          <StatusLabel s={st} />
        </span>
        <Button size="sm" variant="secondary" disabled={!canOpen} onClick={() => void openWebApp(a.id)} className="relative z-10">
          Open
        </Button>
      </div>
    </div>
  );
}
