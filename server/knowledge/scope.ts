// Which knowledge bases a session searches: the shared ones, and its space's own (in a group, those of the
// spaces it brings together too); a space can leave the shared ones out. A session outside spaces searches the
// shared ones alone, and a child session searches as the session that started it.
import type { SessionExtra } from '../../shared/features.ts';
import type { DB } from '../db.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { allSpaces } from '../spaces/index.ts';
import { baseRows, type BaseRow } from './store.ts';

/** The space a session works in: its own, else that of the session that started it. */
export function spaceOfSession(db: DB, extra: SessionExtra): string | null {
  let x = extra;
  for (let i = 0; i < 8 && typeof x.space !== 'string' && typeof x.parent === 'string'; i++) x = sessionExtra(db, x.parent);
  return typeof x.space === 'string' ? x.space : null;
}

/**
 * The bases a session in `space` (null: in none) searches: `own` the space's (`from`: the space a group brought
 * in, by name), the others shared. A base whose space is gone counts as shared.
 */
export function basesFor(db: DB, space: string | null): (BaseRow & { own: boolean; from?: string })[] {
  const spaces = new Map(allSpaces(db).map((s) => [s.id, s]));
  const sp = space ? spaces.get(space) : undefined;
  const members = new Map((sp?.members ?? []).filter((id) => spaces.has(id)).map((id) => [id, spaces.get(id)!.name]));
  const out: (BaseRow & { own: boolean; from?: string })[] = [];
  for (const b of baseRows(db)) {
    if (sp && b.space === sp.id) out.push({ ...b, own: true });
    else if (b.space && members.has(b.space)) out.push({ ...b, own: true, from: members.get(b.space) });
    else if ((!b.space || !spaces.has(b.space)) && sp?.sharedKnowledge !== false) out.push({ ...b, own: false });
  }
  return out;
}

/** The bases the session of a tool call searches. */
export const basesOfSession = (db: DB, key: string) => basesFor(db, spaceOfSession(db, sessionExtra(db, key)));
