// The services a web app uses, on its page: each with what was chosen and what happened to the app's settings, Change,
// and choosing one for another need (the same card as in a session, in a dialog).
import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { AppServicesView, ChosenService, ServicesCardView } from '@shared/services';
import { tr } from '../../i18n/runtime';
import { enc, post } from '../../lib/api';
import { toastError } from '../../lib/store';
import { Button, Dialog, OptionRow, Picker, Section } from '../../components/ui';
import { useLoaded } from './api';
import { ServicesCard } from './ServicesCard';

export function AppServices({ app }: { app: { id: string; name: string } }) {
  const view = useLoaded<AppServicesView>(`/api/webapps/${enc(app.id)}/services`);
  const [card, setCard] = useState<ServicesCardView | null>(null);
  const choose = (need: string) => {
    post<{ card: ServicesCardView }>(`/api/webapps/${enc(app.id)}/services/cards`, { need }).then((r) => setCard(r.card), toastError);
  };
  const closed = () => {
    setCard(null);
    void view.reload();
  };
  const v = view.data;
  if (!v) return null;
  const rest = v.needs.filter((n) => !v.chosen.some((c) => c.need === n.id));
  // What is true of each: set up on the service's own site, needing no key, its keys saved, or what is still missing.
  const stands = (c: ChosenService) => (c.applied.state === 'outside' ? tr('Set up on its own site') : !c.keys.length ? tr('Needs no key') : c.missing?.length ? tr(`Missing: ${c.missing.join(', ')}`) : c.keys.length > 1 ? tr('Its keys are saved') : tr('Its key is saved'));
  return (
    <Section title="Services" sub="What the app uses outside itself, from Hydor’s catalog.">
      <div data-app-services>
        {v.chosen.length > 0 && (
          <ul className="divide-y divide-line">
            {v.chosen.map((c) => (
              <li key={c.need} data-chosen={c.need} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <div className="min-w-0 flex-1 basis-56">
                  <div translate="no" className="text-[12px] text-fg-3">
                    {c.needName}
                  </div>
                  <div className="text-[13.5px]">
                    <span translate="no" className="font-medium">
                      {c.name}
                    </span>
                    <span className={c.missing?.length ? 'text-warn' : 'text-fg-3'}>{` · ${stands(c)}`}</span>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => choose(c.need)}>
                  Change
                </Button>
              </li>
            ))}
          </ul>
        )}
        {!v.chosen.length && <p className="pb-2 text-[13px] leading-snug text-fg-3">Nothing chosen yet. The agent asks as the app needs one, or choose one here.</p>}
        {rest.length > 0 && (
          <div className="pt-1">
            <Picker icon={<Plus size={13} />} value={tr('Choose a service')} title={tr('Choose a service for the app')} width={320} className="-ml-2">
              {(close) => (
                <div className="max-h-[320px] overflow-y-auto p-1">
                  {rest.map((n) => (
                    <OptionRow
                      key={n.id}
                      onClick={() => {
                        close();
                        choose(n.id);
                      }}
                      label={<span translate="no">{n.name}</span>}
                      hint={n.what}
                    />
                  ))}
                </div>
              )}
            </Picker>
          </div>
        )}
      </div>
      {card && (
        <Dialog open onClose={closed} bare width={card.need.services.length >= 3 ? 880 : 640} label={tr(`Services for ${app.name}`)}>
          <ServicesCard key={card.id} id={card.id} initial={card} embedded onClose={closed} />
        </Dialog>
      )}
    </Section>
  );
}
