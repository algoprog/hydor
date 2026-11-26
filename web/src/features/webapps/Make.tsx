// "What do you want to make?": the one front door for a new app. One large box for the person's own words, with three
// sentences that fill it, and under it the ideas as things to tap (each with a drawing). Start goes straight into the
// conversation with the App builder: the name is the agent's to suggest, and nothing else is asked first. With Technical
// details on, the name can be given too and each idea says what it usually needs. Under them all, the small tool an agent
// runs with no pages of its own, which keeps its own ways in. At /apps/make.
import { useRef, useState } from 'react';
import { FilePlus2, FileUp, Sparkles } from 'lucide-react';
import type { WebKind, WebKinds } from '@shared/webapps';
import { tr } from '../../i18n/runtime';
import { go } from '../../lib/nav';
import { useUI } from '../../lib/store';
import { Button, Throbber, useMediaQuery } from '../../components/ui';
import { InstallFromFile } from '../apps/Install';
import { useStartBuilder } from '../apps/startBuilder';
import { PageHeader } from '../layout/PageHeader';
import { useLoaded } from './api';
import { MakeView } from './MakeView';
import { planStart } from './start';

function SmallTool() {
  return (
    <section aria-label={tr('A small tool')} className="rounded-2xl border border-line px-4 py-4 sm:px-5">
      <h2 className="text-[14px] font-semibold tracking-tight">{tr('Or a small tool, with no pages of its own')}</h2>
      <p className="mt-0.5 text-[13px] leading-snug text-pretty text-fg-3">{tr('An agent runs it for you: a form in, an answer out, again and again or by itself. Nobody signs in to it.')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<Sparkles size={14} />} onClick={() => go('/?assistant=app-builder')}>
          Describe it to an agent
        </Button>
        <Button size="sm" variant="secondary" icon={<FilePlus2 size={14} />} onClick={() => go('/apps/new')}>
          Start from scratch
        </Button>
        <InstallFromFile
          trigger={(pick) => (
            <Button size="sm" variant="secondary" icon={<FileUp size={14} />} onClick={pick}>
              Install from a file
            </Button>
          )}
        />
      </div>
    </section>
  );
}

export function MakePage() {
  const { data, error } = useLoaded<WebKinds>('/api/webapps/kinds');
  const technical = useUI((s) => s.technicalDetails);
  const start = useStartBuilder();
  const phone = useMediaQuery('(max-width: 639px)');
  const going = useRef(false);
  const begin = (o: { kind: WebKind | null; name: string; line: string }) => {
    if (going.current) return;
    going.current = true;
    const plan = planStart(o, tr);
    start(plan.prompt, { webKind: plan.webKind }, { make: plan.make, placeholder: plan.placeholder });
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="New app" back={{ label: 'Back', onClick: () => go('/apps') }} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[920px] px-4 py-5 pb-24 sm:px-6 sm:py-9">
          {error && !data ? (
            // Web apps turned off here (or the list could not be read): what the server says, and the small tool, which needs none of it.
            <div className="space-y-9">
              <div role="note" className="rounded-xl border border-line px-4 py-3 text-[13.5px] leading-snug text-fg-2" translate="no">
                {error}
              </div>
              <SmallTool />
            </div>
          ) : !data ? (
            <div className="flex justify-center py-20" role="status" aria-label={tr('Reading what there is…')}>
              <Throbber size={28} />
            </div>
          ) : (
            <MakeView kinds={data.kinds} technical={technical} focus={!phone} onStart={begin} after={<SmallTool />} />
          )}
        </div>
      </div>
    </div>
  );
}
