// Which space something of the Library goes in (a page, a picture or video kept): a space's id, or none. What an
// agent saves goes in its session's space; what you keep yourself goes where you pick (the pages ask when there are
// spaces). Deleting a space leaves what it held in the Library, in no space (deleteSpace).
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { spaceById } from './index.ts';

/** The space a session is in, when it still exists. */
export function sessionSpace(db: DB, key: string | undefined): string | null {
  if (!key) return null;
  try {
    const id = sessionExtra(db, key).space;
    return typeof id === 'string' && id && spaceById(db, id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * The space asked for: a space's id, or none (null, "" or "none"); an id no space has is refused. Not asked
 * (undefined): `fallback`, when that space still exists.
 */
export function spaceChoice(db: DB, v: unknown, fallback: string | null = null): string | null {
  if (v === undefined) return fallback && spaceById(db, fallback) ? fallback : null;
  if (v === null || v === '' || v === 'none') return null;
  if (typeof v !== 'string' || !spaceById(db, v)) throw new HttpError(400, 'space: a project’s id (GET /api/spaces lists them), or null for none');
  return v;
}
