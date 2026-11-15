// The Outbox: a connected account's tool on Ask first is held for your OK instead of being called. Each held call
// waits in the Inbox as a draft to change, send or drop (OutboxCard, OutboxSection), and shows as a line in its
// session (OutboxLine): waiting, then sent with its answer, or dropped.
import type { WebFeature } from '../registry';
import { OutboxLine } from './OutboxLine';

export const outboxFeature: WebFeature = {
  id: 'outbox',
  noteViews: { outbox: OutboxLine },
};
