// The pages a person reads and the forms on them.
import express from 'express';
import { KINDS } from './records.js';
import { Refusal, id } from './input.js';
import { sessionToken, setSession, clearSession, inviteLink } from './web.js';
import * as views from './views.js';

const NOTICES = {
  added: 'Added.', saved: 'Saved.', deleted: 'Deleted.', crew: 'Crew created. You are its lead.',
  joined: 'You have joined the crew.', removed: 'Taken out. They no longer have access.',
  left: 'You have left the crew.', cancelled: 'That link no longer works.', renamed: 'Crew renamed.',
};

// Only addresses inside this app may be returned to.
const local = (value, otherwise) =>
  typeof value === 'string' && /^\/(?![/\\])[\w\-./?=&]*$/.test(value) ? value : otherwise;

const withNotice = (address, notice) => `${address}${address.includes('?') ? '&' : '?'}done=${notice}`;

export function pages({ accounts, crews, records }) {
  const router = express.Router();
  const body = (req) => req.body ?? {};

  function show(req, res, { title, section, content, error, status = 200 }) {
    const notice = Object.hasOwn(NOTICES, req.query.done) ? NOTICES[req.query.done] : '';
    res.status(status).type('html').send(views.layout({ title, section, content, error, notice, user: req.user }));
  }

  // Do the work; if it is refused, show the same page again with the reason and what was typed.
  function attempt(res, work, again) {
    try {
      work();
    } catch (error) {
      if (!(error instanceof Refusal) || error.status === 404) throw error;
      again(error);
    }
  }

  const signedIn = (req, res, next) => {
    if (req.user) return next();
    res.redirect(303, '/sign-in');
  };

  router.get('/', (req, res) => {
    if (req.user) return res.redirect(303, '/home');
    show(req, res, { title: 'Welcome', content: views.welcome() });
  });

  for (const [kind, title] of [['sign-up', 'Make an account'], ['sign-in', 'Sign in']]) {
    router.get(`/${kind}`, (req, res) => {
      const next = local(req.query.next);
      if (req.user) return res.redirect(303, next ?? '/home');
      show(req, res, { title, content: views.signForm({ kind, next }) });
    });
    router.post(`/${kind}`, async (req, res) => {
      const next = local(body(req).next);
      try {
        const { token } = kind === 'sign-up' ? await accounts.signUp(body(req)) : await accounts.signIn(body(req), req.ip);
        accounts.signOut(sessionToken(req));
        setSession(req, res, token);
        res.redirect(303, next ?? '/home');
      } catch (error) {
        if (!(error instanceof Refusal)) throw error;
        show(req, res, { title, error: error.message, status: error.status,
          content: views.signForm({ kind, next, values: body(req) }) });
      }
    });
  }

  router.post('/sign-out', (req, res) => {
    accounts.signOut(sessionToken(req));
    clearSession(req, res);
    const next = local(body(req).next);
    res.redirect(303, next ? `/sign-in?next=${encodeURIComponent(next)}` : '/');
  });

  router.get('/invite/:token', (req, res) => {
    const { token } = req.params;
    if (!/^[\w-]{1,100}$/.test(token)) throw new Refusal(404, 'This invitation link is not valid.');
    let invitation;
    let problem;
    let status = 200;
    if (req.user) {
      try {
        invitation = crews.check(req.user, token);
      } catch (error) {
        if (!(error instanceof Refusal)) throw error;
        problem = error.message;
        status = error.status;
      }
    }
    show(req, res, { title: 'Invitation', status, content: views.invitePage({ token, user: req.user, invitation, problem }) });
  });

  router.post('/invite/:token', (req, res) => {
    const { token } = req.params;
    if (!/^[\w-]{1,100}$/.test(token)) throw new Refusal(404, 'This invitation link is not valid.');
    if (!req.user) return res.redirect(303, `/invite/${token}`);
    try {
      const crew = crews.accept(req.user, token);
      res.redirect(303, withNotice(`/crews/${crew.id}`, 'joined'));
    } catch (error) {
      if (!(error instanceof Refusal)) throw error;
      show(req, res, { title: 'Invitation', status: error.status,
        content: views.invitePage({ token, user: req.user, problem: error.message }) });
    }
  });

  router.get('/home', signedIn, (req, res) => {
    const rows = Object.fromEntries(Object.keys(KINDS).map((kind) => [kind, records.list(req.user, kind)]));
    show(req, res, { title: 'Home', section: 'home', content: views.home({ crews: crews.list(req.user), rows }) });
  });

  for (const kind of Object.keys(KINDS)) {
    const { title, one } = KINDS[kind];

    function showList(req, res, crewId, extra = {}) {
      const mine = crews.list(req.user);
      const only = mine.some((c) => c.id === crewId) ? crewId : null;
      show(req, res, { title, section: kind, error: extra.error, status: extra.status, content: views.listPage({
        kind, crews: mine, crewId: only, items: records.list(req.user, kind, only ?? undefined),
        values: extra.values, failed: Boolean(extra.error) }) });
    }

    function showEdit(req, res, extra = {}) {
      const item = records.get(req.user, kind, req.params.id);
      show(req, res, { title: `Change ${one}`, section: kind, error: extra.error, status: extra.status,
        content: views.editPage({ kind, item, values: extra.values }) });
    }

    // A tick box that is not ticked sends nothing, which means "no".
    const fromForm = (req) => (kind === 'jobs' ? { ...body(req), done: body(req).done ?? 'false' } : body(req));

    router.get(`/${kind}`, signedIn, (req, res) => {
      const crewId = id(req.query.crew);
      if (req.query.crew !== undefined) crews.mine(req.user, req.query.crew);
      showList(req, res, crewId);
    });
    router.post(`/${kind}`, signedIn, (req, res) => {
      const back = local(body(req).back, `/${kind}`);
      attempt(res, () => {
        records.add(req.user, kind, body(req));
        res.redirect(303, withNotice(back, 'added'));
      }, (error) => showList(req, res, id(body(req).crew), { error: error.message, status: error.status, values: body(req) }));
    });
    router.get(`/${kind}/:id`, signedIn, (req, res) => showEdit(req, res));
    router.post(`/${kind}/:id`, signedIn, (req, res) => {
      attempt(res, () => {
        const item = records.change(req.user, kind, req.params.id, fromForm(req));
        res.redirect(303, withNotice(`/${kind}?crew=${item.crew}`, 'saved'));
      }, (error) => showEdit(req, res, { error: error.message, status: error.status, values: fromForm(req) }));
    });
    router.post(`/${kind}/:id/delete`, signedIn, (req, res) => {
      attempt(res, () => {
        records.remove(req.user, kind, req.params.id);
        res.redirect(303, withNotice(`/${kind}`, 'deleted'));
      }, (error) => showEdit(req, res, { error: error.message, status: error.status }));
    });
  }

  router.post('/jobs/:id/done', signedIn, (req, res) => {
    records.change(req.user, 'jobs', req.params.id, { done: body(req).done ?? '' });
    res.redirect(303, withNotice(local(body(req).back, '/jobs'), 'saved'));
  });

  function showCrews(req, res, extra = {}) {
    show(req, res, { title: 'Crews', section: 'crews', error: extra.error, status: extra.status,
      content: views.crewsPage({ crews: crews.list(req.user), values: extra.values }) });
  }

  function showCrew(req, res, extra = {}) {
    const crew = crews.mine(req.user, req.params.id);
    const invitations = crew.role === 'lead'
      ? crews.invitations(req.user, crew.id).map((i) => ({ ...i, url: inviteLink(req, i.token) }))
      : [];
    // After a link is made, it is shown at the top of the invite section.
    const made = invitations.find((i) => i.id === id(req.query.made));
    show(req, res, { title: crew.name, section: 'crews', error: extra.error, status: extra.status,
      content: views.crewPage({ crew, user: req.user, members: crews.members(req.user, crew.id), invitations,
        link: made, values: extra.values }) });
  }

  router.get('/crews', signedIn, (req, res) => showCrews(req, res));
  router.post('/crews', signedIn, (req, res) => {
    attempt(res, () => {
      const crew = crews.create(req.user, body(req));
      res.redirect(303, withNotice(`/crews/${crew.id}`, 'crew'));
    }, (error) => showCrews(req, res, { error: error.message, status: error.status, values: body(req) }));
  });
  router.get('/crews/:id', signedIn, (req, res) => showCrew(req, res));

  // A form on a crew's page: on refusal the page is shown again (a member who may not is told so).
  const crewForm = (path, work) => router.post(`/crews/:id/${path}`, signedIn, (req, res) => {
    attempt(res, () => res.redirect(303, work(req)),
      (error) => showCrew(req, res, { error: error.message, status: error.status, values: body(req) }));
  });
  crewForm('invite', (req) => {
    const made = crews.invite(req.user, { ...body(req), crew: req.params.id });
    return `/crews/${made.crew}?made=${made.id}`;
  });
  crewForm('remove', (req) => {
    crews.remove(req.user, { crew: req.params.id, user: body(req).user, email: body(req).email });
    return id(body(req).user) === req.user.id ? withNotice('/crews', 'left') : withNotice(`/crews/${id(req.params.id)}`, 'removed');
  });
  crewForm('rename', (req) => withNotice(`/crews/${crews.rename(req.user, req.params.id, body(req)).id}`, 'renamed'));
  crewForm('invitations/:invitation/cancel', (req) => {
    const crew = crews.asLead(req.user, req.params.id);
    crews.cancelInvitation(req.user, req.params.invitation);
    return withNotice(`/crews/${crew.id}`, 'cancelled');
  });

  return router;
}
