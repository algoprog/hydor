// A web app's keys card in the conversation: put up by webapp_keys, or by webapp_launch before its own card, whose
// answer ends with the card's marker.
import { keysCardOf } from '@shared/keys';
import type { ToolItem } from '@shared/types';
import { KeysCard } from './KeysCard';

export function KeysRow({ item }: { item: ToolItem }) {
  const id = keysCardOf(item.tool.output);
  return id ? <KeysCard key={id} id={id} /> : null;
}
