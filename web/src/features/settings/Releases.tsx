// Release notes: what changed in each version (CHANGELOG.md, from /api/releases), in a dialog that Settings →
// General and the search box open. Once after the app updates, a note says so and opens what is new.
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { compareVersions, type ReleasesResponse } from '@shared/releases';
import { Markdown } from '../../components/Markdown';
import { Badge, Dialog, Throbber } from '../../components/ui';
import { api } from '../../lib/api';
import { toastError, useApp, useToasts } from '../../lib/store';

export const useReleaseNotes = create<{ open: boolean; at?: string }>(() => ({ open: false }));

/** Opens the release notes, at a version when given. */
export const openReleaseNotes = (at?: string) => useReleaseNotes.setState({ open: true, at });

export function ReleaseNotes() {
  const { open, at } = useReleaseNotes();
  const [data, setData] = useState<ReleasesResponse | null>(null);
  useEffect(() => {
    if (open) api<ReleasesResponse>('/api/releases').then(setData, toastError);
  }, [open]);
  // At the version asked for, once its notes are there.
  useEffect(() => {
    if (open && data && at) requestAnimationFrame(() => document.getElementById(`release-${at}`)?.scrollIntoView({ block: 'start' }));
  }, [open, data, at]);
  return (
    <Dialog open={open} onClose={() => useReleaseNotes.setState({ open: false, at: undefined })} title="Release notes" width={680}>
      {!data ? (
        <div className="flex justify-center py-10">
          <Throbber className="text-fg-3" />
        </div>
      ) : !data.releases.length ? (
        <p className="py-6 text-center text-[13.5px] text-fg-3">This copy has no release notes.</p>
      ) : (
        <div className="-mx-1 max-h-[65vh] space-y-6 overflow-y-auto px-1 pb-1">
          {data.releases.map((r) => (
            <section key={r.version} id={`release-${r.version}`} className="scroll-mt-2">
              <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-line pb-1.5">
                <h3 className="text-[16px] font-semibold tracking-tight text-fg">{r.version}</h3>
                {r.date && <span className="text-[12.5px] text-fg-3">{r.date}</span>}
                {r.version === data.current && <Badge tone="info">This version</Badge>}
              </header>
              <Markdown text={r.notes} className="mt-2 !text-[13.5px] !leading-relaxed" />
            </section>
          ))}
        </div>
      )}
    </Dialog>
  );
}

const SEEN = 'wa.seenVersion';

/** Once after the app updates: a note that it did, which opens what is new. A first visit says nothing. */
export function WhatsNew() {
  const version = useApp((s) => s.boot?.version);
  useEffect(() => {
    if (!version) return;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN);
      localStorage.setItem(SEEN, version);
    } catch {
      return;
    }
    if (seen && compareVersions(version, seen) > 0) useToasts.getState().push('ok', `Updated to Naget Agent ${version}`, { label: 'What’s new', run: () => openReleaseNotes(version) });
  }, [version]);
  return null;
}
