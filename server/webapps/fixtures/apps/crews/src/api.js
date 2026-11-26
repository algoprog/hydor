// The /api addresses: JSON in, JSON out. They use the same rules as the pages.
import express from 'express';
import { KINDS } from './records.js';
import { refuse } from './input.js';
import { sessionToken, setSession, clearSession, inviteLink } from './web.js';

export function api({ accounts, crews, records }) {
  const router = express.Router();
  const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

  router.post('/sign-up', async (req, res) => {
    const { user, token } = await accounts.signUp(body(req));
    setSession(req, res, token);
    res.status(201).json({ id: user.id, name: user.name, email: user.email });
  });

  router.post('/sign-in', async (req, res) => {
    const { user, token } = await accounts.signIn(body(req), req.ip);
    accounts.signOut(sessionToken(req));
    setSession(req, res, token);
    res.json({ id: user.id, name: user.name, email: user.email });
  });

  router.post('/sign-out', (req, res) => {
    accounts.signOut(sessionToken(req));
    clearSession(req, res);
    res.json({ ok: true });
  });

  // Everything below needs a signed-in person.
  router.use((req, res, next) => {
    if (!req.user) refuse(401, 'Sign in first.');
    next();
  });

  router.get('/me', (req, res) => res.json(req.user));

  router.get('/crews', (req, res) => res.json({ rows: crews.list(req.user) }));
  router.post('/crews', (req, res) => res.status(201).json(crews.create(req.user, body(req))));
  router.post('/crews/remove', (req, res) => res.json(crews.remove(req.user, body(req))));
  router.get('/crews/:id', (req, res) => res.json(crews.mine(req.user, req.params.id)));
  router.patch('/crews/:id', (req, res) => res.json(crews.rename(req.user, req.params.id, body(req))));
  router.get('/crews/:id/members', (req, res) => res.json({ rows: crews.members(req.user, req.params.id) }));

  const withLink = (req, { token, ...invitation }) => ({ ...invitation, link: inviteLink(req, token) });
  router.get('/invitations', (req, res) =>
    res.json({ rows: crews.invitations(req.user, req.query.crew).map((i) => withLink(req, i)) }));
  router.post('/invitations', (req, res) => res.status(201).json(withLink(req, crews.invite(req.user, body(req)))));
  router.delete('/invitations/:id', (req, res) => {
    crews.cancelInvitation(req.user, req.params.id);
    res.json({ ok: true });
  });
  router.post('/invitations/:token/accept', (req, res) => res.json(crews.accept(req.user, req.params.token)));

  for (const kind of Object.keys(KINDS)) {
    router.get(`/${kind}`, (req, res) => res.json({ rows: records.list(req.user, kind, req.query.crew) }));
    router.post(`/${kind}`, (req, res) => res.status(201).json(records.add(req.user, kind, body(req))));
    router.get(`/${kind}/:id`, (req, res) => res.json(records.get(req.user, kind, req.params.id)));
    router.patch(`/${kind}/:id`, (req, res) => res.json(records.change(req.user, kind, req.params.id, body(req))));
    router.delete(`/${kind}/:id`, (req, res) => {
      records.remove(req.user, kind, req.params.id);
      res.json({ ok: true });
    });
  }

  router.use(() => refuse(404, 'There is nothing at that address.'));
  return router;
}
