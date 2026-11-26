// A webapp_services call in the conversation: the card to choose a service on, or (where one service is offered, or the
// agent recorded the one the person named) the keys card for it.
import { keysCardOf } from '@shared/keys';
import { servicesCardOf } from '@shared/services';
import type { ToolItem } from '@shared/types';
import { KeysCard } from '../connections/KeysCard';
import { ServicesCard } from './ServicesCard';

export function ServicesRow({ item }: { item: ToolItem }) {
  const out = item.tool.output;
  const card = servicesCardOf(out);
  if (card) return <ServicesCard key={card} id={card} />;
  const keys = keysCardOf(out);
  return keys ? <KeysCard key={keys} id={keys} /> : null;
}
