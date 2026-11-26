// Crews, who is in them, and invitations.
// Membership is looked up in the database on every request, so taking someone out works at once.
import { randomBytes } from 'node:crypto';
import { transaction } from './db.js';
import * as input from './input.js';
import { refuse } from './input.js';

export function crews(db) {
  const membership = (userId, crewId) =>
    db.prepare(`SELECT c.id, c.name, m.role FROM memberships m JOIN crews c ON c.id = m.crew_id
      WHERE m.user_id = ? AND m.crew_id = ?`).get(userId, crewId);

  // Someone outside a crew is told it does not exist.
  function mine(user, crewId) {
    const found = input.id(crewId) && membership(user.id, input.id(crewId));
    if (!found) refuse(404, 'There is no such crew among yours.');
    return { ...found };
  }

  function asLead(user, crewId) {
    const crew = mine(user, crewId);
    if (crew.role !== 'lead') refuse(403, 'Only a lead of this crew can do that.');
    return crew;
  }

  const invitationFor = (token) =>
    db.prepare(`SELECT i.*, c.name AS crew_name FROM invitations i JOIN crews c ON c.id = i.crew_id
      WHERE i.token = ?`).get(String(token));

  // Whether this person may use this link now. Throws the reason when not.
  function usable(user, token) {
    const invitation = invitationFor(token);
    if (!invitation || invitation.cancelled_at) refuse(404, 'This invitation link is not valid. Ask the lead for a new one.');
    if (invitation.used_at) refuse(410, 'This invitation link has already been used. Ask the lead for a new one.');
    if (invitation.email !== user.email) {
      refuse(403, 'This invitation was made for a different email address. Sign in with that address, or ask the lead for a new link.');
    }
    return invitation;
  }

  return {
    mine,
    asLead,

    list(user) {
      return db.prepare(`SELECT c.id, c.name, m.role FROM memberships m JOIN crews c ON c.id = m.crew_id
        WHERE m.user_id = ? ORDER BY c.name COLLATE NOCASE, c.id`).all(user.id).map((row) => ({ ...row }));
    },

    create(user, body) {
      const name = input.text(body.name, 'The crew’s name', { required: true, max: 100 });
      return transaction(db, () => {
        const crewId = Number(db.prepare('INSERT INTO crews (name) VALUES (?)').run(name).lastInsertRowid);
        db.prepare("INSERT INTO memberships (crew_id, user_id, role) VALUES (?, ?, 'lead')").run(crewId, user.id);
        return { id: crewId, name, role: 'lead' };
      });
    },

    rename(user, crewId, body) {
      const crew = asLead(user, crewId);
      const name = input.text(body.name, 'The crew’s name', { required: true, max: 100 });
      db.prepare('UPDATE crews SET name = ? WHERE id = ?').run(name, crew.id);
      return { ...crew, name };
    },

    members(user, crewId) {
      const crew = mine(user, crewId);
      return db.prepare(`SELECT u.id, u.name, u.email, m.role FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.crew_id = ? ORDER BY m.role, u.name COLLATE NOCASE`).all(crew.id).map((row) => ({ ...row }));
    },

    invite(user, body) {
      if (!input.id(body.crew)) refuse(400, 'Choose which crew the invitation is for.');
      const crew = asLead(user, body.crew);
      const email = input.email(body.email);
      const role = input.role(body.role);
      const already = db.prepare(`SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.crew_id = ? AND u.email = ?`).get(crew.id, email);
      if (already) refuse(409, 'That person is already in this crew. To change their role, take them out and invite them again.');
      const token = randomBytes(24).toString('base64url');
      return transaction(db, () => {
        // Only the newest link for a person works.
        db.prepare(`UPDATE invitations SET cancelled_at = datetime('now')
          WHERE crew_id = ? AND email = ? AND used_at IS NULL AND cancelled_at IS NULL`).run(crew.id, email);
        const added = db.prepare('INSERT INTO invitations (crew_id, email, role, token, created_by) VALUES (?, ?, ?, ?, ?)')
          .run(crew.id, email, role, token, user.id);
        return { id: Number(added.lastInsertRowid), crew: crew.id, email, role, token };
      });
    },

    // Links not yet used, for the crews this person leads.
    invitations(user, crewId) {
      const only = crewId === undefined ? null : asLead(user, crewId).id;
      return db.prepare(`SELECT i.id, i.crew_id AS crew, i.email, i.role, i.token FROM invitations i
        JOIN memberships m ON m.crew_id = i.crew_id AND m.user_id = ? AND m.role = 'lead'
        WHERE i.used_at IS NULL AND i.cancelled_at IS NULL AND (? IS NULL OR i.crew_id = ?)
        ORDER BY i.id DESC`).all(user.id, only, only).map((row) => ({ ...row }));
    },

    cancelInvitation(user, invitationId) {
      const found = db.prepare(`SELECT i.id FROM invitations i
        JOIN memberships m ON m.crew_id = i.crew_id AND m.user_id = ? AND m.role = 'lead'
        WHERE i.id = ? AND i.used_at IS NULL AND i.cancelled_at IS NULL`).get(user.id, input.id(invitationId) ?? 0);
      if (!found) refuse(404, 'There is no such invitation waiting.');
      db.prepare("UPDATE invitations SET cancelled_at = datetime('now') WHERE id = ?").run(found.id);
    },

    check(user, token) {
      const invitation = usable(user, token);
      return { crew: invitation.crew_id, name: invitation.crew_name, role: invitation.role };
    },

    accept(user, token) {
      return transaction(db, () => {
        const invitation = usable(user, token);
        db.prepare('INSERT OR IGNORE INTO memberships (crew_id, user_id, role) VALUES (?, ?, ?)')
          .run(invitation.crew_id, user.id, invitation.role);
        db.prepare("UPDATE invitations SET used_at = datetime('now') WHERE id = ?").run(invitation.id);
        return { ...membership(user.id, invitation.crew_id) };
      });
    },

    // The person is named by their email (or their number).
    remove(user, body) {
      if (!input.id(body.crew)) refuse(400, 'Choose which crew.');
      const crew = asLead(user, body.crew);
      const byNumber = input.id(body.user);
      const email = byNumber ? null : input.email(body.email);
      return transaction(db, () => {
        const target = db.prepare(`SELECT u.id, u.email, u.name, m.role FROM users u
          LEFT JOIN memberships m ON m.user_id = u.id AND m.crew_id = ?
          WHERE ${byNumber ? 'u.id = ?' : 'u.email = ?'}`).get(crew.id, byNumber ?? email);
        const targetEmail = target?.email ?? email;
        const cancelled = db.prepare(`UPDATE invitations SET cancelled_at = datetime('now')
          WHERE crew_id = ? AND used_at IS NULL AND cancelled_at IS NULL AND (email = ? OR created_by = ?)`);
        if (!target?.role) {
          // Not in the crew yet: withdraw any link waiting for them.
          if (targetEmail && cancelled.run(crew.id, targetEmail, 0).changes) return { removed: targetEmail };
          refuse(404, 'That person is not in this crew.');
        }
        if (target.role === 'lead') {
          const leads = db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE crew_id = ? AND role = 'lead'").get(crew.id).n;
          if (leads <= 1) refuse(409, 'A crew must keep at least one lead. Invite another lead first.');
        }
        db.prepare('DELETE FROM memberships WHERE crew_id = ? AND user_id = ?').run(crew.id, target.id);
        cancelled.run(crew.id, target.email, target.id);
        return { removed: target.email };
      });
    },
  };
}
