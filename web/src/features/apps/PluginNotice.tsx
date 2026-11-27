// "Needs the <title> plugin": on an app's page, for each plugin it needs that is not on for the program picked, with the
// button that adds it, turns it on or sets it up, through the routes Settings → Plugins uses.
import { useEffect, useState } from 'react';
import { Puzzle } from 'lucide-react';
import type { PluginAgent, PluginJob, PluginNeed } from '@shared/plugins';
import { api, enc, post } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Button, Throbber } from '../../components/ui';

/** What is wrong, in a line of its own for each way (each translates whole). */
function problemLine(p: PluginNeed, agent: boolean): string {
  if (agent) return 'It does not work with the agent picked here: pick another.';
  switch (p.state) {
    case 'missing':
      return 'It is not added yet.';
    case 'unknown':
      return 'It does not come with Hydor: add it in Settings → Plugins from a link, a file or a folder.';
    case 'off':
      return 'It is turned off.';
    case 'installing':
      return 'It is being set up.';
    case 'setup':
      return 'It is not set up yet.';
    case 'broken':
      return 'It cannot be read: remove it and add it again.';
    default:
      return p.action ? `It needs the ${p.action.title} plugin too.` : 'A plugin it needs is not on.';
  }
}

/** The button's words: what pressing it does, to this plugin or to one it needs first. */
function actionLabel(p: PluginNeed): string {
  const other = p.action!.plugin !== p.name;
  if (p.action!.do === 'install') return other ? `Add ${p.action!.title}` : 'Add the plugin';
  if (p.action!.do === 'enable') return other ? `Turn on ${p.action!.title}` : 'Turn the plugin on';
  return other ? `Set up ${p.action!.title}` : 'Set the plugin up';
}

export function PluginNotice({ needs, programs, onChanged }: { needs: PluginNeed[]; programs: PluginAgent[]; onChanged: () => void }) {
  // The plugins a job is adding or setting up now.
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  useEffect(() => setBusy({}), [needs]);
  useFeatureEvent('plugins', (e) => {
    const d = e.data as { job?: PluginJob; changed?: boolean };
    if (d.job?.state === 'failed' && busy[d.job.plugin]) {
      toast(d.job.error ?? 'It could not be added', 'error');
      setBusy((b) => ({ ...b, [d.job!.plugin]: false }));
    }
    if (d.changed) onChanged();
  });
  const act = async (a: NonNullable<PluginNeed['action']>) => {
    setBusy((b) => ({ ...b, [a.plugin]: true }));
    try {
      if (a.do === 'install') {
        const r = await post<{ job: PluginJob }>('/api/plugins/install', { name: a.plugin });
        // A job that ended before its news was heard.
        const now = await api<{ job: PluginJob }>(`/api/plugins/jobs/${enc(r.job.id)}`).catch(() => null);
        if (now?.job.state === 'done') onChanged();
      } else await post(`/api/plugins/${enc(a.plugin)}/${a.do}`);
      if (a.do === 'enable') onChanged();
    } catch (e) {
      toastError(e);
      setBusy((b) => ({ ...b, [a.plugin]: false }));
    }
  };
  const list = needs.map((p) => ({ p, agent: p.state === 'on' && programs.some((k) => !p.agents?.includes(k)) })).filter((x) => x.p.state !== 'on' || x.agent);
  if (!list.length) return null;
  return (
    <div className="space-y-2" data-plugin-needs>
      {list.map(({ p, agent }) => {
        const working = p.state === 'installing' || (p.action ? busy[p.action.plugin] : false);
        return (
          <div key={p.name} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-warn/30 bg-warn/8 px-4 py-3">
            <Puzzle size={17} className="shrink-0 text-warn" aria-hidden />
            <div className="min-w-[200px] flex-1">
              <div className="text-[13.5px] font-medium">{`Needs the ${p.title} plugin`}</div>
              <div className="text-[12.5px] leading-snug text-fg-2">{problemLine(p, agent)}</div>
            </div>
            {!agent && p.state !== 'on' && (
              <button type="button" onClick={() => go(`/settings?s=plugins&plugin=${enc(p.name)}`)} className="text-[12.5px] text-fg-3 hover:text-fg">
                Open Plugins
              </button>
            )}
            {working ? (
              <span className="inline-flex items-center gap-2 text-[12.5px] text-fg-3">
                <Throbber /> Setting it up…
              </span>
            ) : (
              p.action && (
                <Button size="sm" variant="primary" onClick={() => void act(p.action!)}>
                  {actionLabel(p)}
                </Button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
