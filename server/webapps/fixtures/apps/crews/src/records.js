// Customers, jobs and notes. Each row belongs to one crew and is only ever reached through
// a join with the signed-in person's memberships.
import * as input from './input.js';
import { refuse } from './input.js';

export const KINDS = {
  customers: {
    one: 'customer',
    title: 'Customers',
    order: 'r.name COLLATE NOCASE, r.id',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, max: 200 },
      { key: 'address', label: 'Address', type: 'long', max: 5000 },
    ],
  },
  jobs: {
    one: 'job',
    title: 'Jobs',
    order: 'r.done, CASE WHEN r.done = 0 THEN r.day END, r.day DESC, r.id',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, max: 200 },
      { key: 'day', label: 'Day it is for', type: 'date', required: true },
      { key: 'done', label: 'Done', type: 'yesno' },
    ],
  },
  notes: {
    one: 'note',
    title: 'Notes',
    order: 'r.id DESC',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, max: 200 },
      { key: 'note', label: 'Note', type: 'long', max: 20000 },
    ],
  },
};

function read(field, value) {
  if (field.type === 'date') return input.day(value, field.label);
  if (field.type === 'yesno') return value === undefined ? 0 : Number(input.yesNo(value, field.label));
  return input.text(value, field.label, { required: field.required, max: field.max, lines: field.type === 'long' });
}

function shape(kind, row) {
  const out = { id: row.id, crew: row.crew_id, crewName: row.crew_name };
  for (const field of KINDS[kind].fields) out[field.key] = field.type === 'yesno' ? Boolean(row[field.key]) : row[field.key];
  return out;
}

// `kind` is always one of the keys of KINDS (the routes are made from them), never something a person typed.
export function records(db, crews) {
  const select = (kind) => `SELECT r.*, c.name AS crew_name, m.role AS my_role FROM ${kind} r
    JOIN memberships m ON m.crew_id = r.crew_id AND m.user_id = ?
    JOIN crews c ON c.id = r.crew_id`;

  function find(user, kind, rowId) {
    const row = db.prepare(`${select(kind)} WHERE r.id = ?`).get(user.id, input.id(rowId) ?? 0);
    if (!row) refuse(404, `There is no such ${KINDS[kind].one} in your crews.`);
    return row;
  }

  return {
    list(user, kind, crewId) {
      const only = crewId === undefined || crewId === '' ? null : crews.mine(user, crewId).id;
      return db.prepare(`${select(kind)} WHERE (? IS NULL OR r.crew_id = ?) ORDER BY ${KINDS[kind].order}`)
        .all(user.id, only, only).map((row) => shape(kind, row));
    },

    get(user, kind, rowId) {
      const row = find(user, kind, rowId);
      return { ...shape(kind, row), canRemove: row.my_role === 'lead' };
    },

    add(user, kind, body) {
      if (body.crew === undefined || body.crew === null || body.crew === '') refuse(400, 'Choose which crew this is for.');
      const crewId = input.id(body.crew);
      let crew;
      try {
        crew = crews.mine(user, crewId);
      } catch {
        refuse(403, 'You can only add to a crew you are in.');
      }
      const fields = KINDS[kind].fields;
      const values = fields.map((field) => read(field, body[field.key]));
      const added = db.prepare(`INSERT INTO ${kind} (crew_id, ${fields.map((f) => f.key).join(', ')})
        VALUES (?, ${fields.map(() => '?').join(', ')})`).run(crew.id, ...values);
      return this.get(user, kind, Number(added.lastInsertRowid));
    },

    // Only what is sent is changed. A row stays with the crew it was added to.
    change(user, kind, rowId, body) {
      const row = find(user, kind, rowId);
      if (body.crew !== undefined && input.id(body.crew) !== row.crew_id) {
        refuse(400, `A ${KINDS[kind].one} cannot be moved to another crew.`);
      }
      const sent = KINDS[kind].fields.filter((field) => body[field.key] !== undefined);
      if (!sent.length) refuse(400, 'There is nothing to change.');
      const values = sent.map((field) => read(field, body[field.key]));
      db.prepare(`UPDATE ${kind} SET ${sent.map((f) => `${f.key} = ?`).join(', ')} WHERE id = ?`).run(...values, row.id);
      return this.get(user, kind, row.id);
    },

    remove(user, kind, rowId) {
      const row = find(user, kind, rowId);
      if (row.my_role !== 'lead') refuse(403, `Only a lead of the crew can delete a ${KINDS[kind].one}.`);
      db.prepare(`DELETE FROM ${kind} WHERE id = ?`).run(row.id);
    },
  };
}
