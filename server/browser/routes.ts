// The browser's API for the pages: Settings → Browser, and each session's browser (its live view, the
// user taking over and handing back, answering what waits for them). All under /api/, signed in.
import fs from 'node:fs';
import type { FastifyRequest } from 'fastify';
import type { BrowserInput, BrowserSettingsState } from '../../shared/browser.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { Deps } from '../features/types.ts';
import { downloadChrome, downloadState, findChromes, pickChrome, sandboxOff, forgetChromes } from './chrome.ts';
import { hostPort, isPrivate, refusal } from './guard.ts';
import { normalizeUrl } from './ops.ts';
import { browserOf, emitView, ensureBrowser, openBrowsers, outsideSessions, profileKey, viewOf } from './session.ts';
import { addProfile, browserSettings, profiles, removeProfile, renameProfile, sessionOptions, setBrowserSettings, setSessionOptions } from './settings.ts';
import { stepFile } from './steps.ts';

const P = (req: FastifyRequest) => req.params as Record<string, string>;
const B = (req: FastifyRequest) => (req.body ?? {}) as Record<string, any>;

export function browserRoutes(d: Deps) {
  const { app, db } = d;

  const state = (): BrowserSettingsState => {
    const settings = browserSettings(db);
    return { settings, chromes: findChromes(), chrome: pickChrome(settings.chrome), download: downloadState(), profiles: profiles(db), noSandbox: sandboxOff() || undefined, open: openBrowsers().length };
  };

  app.get('/api/browser/settings', async () => state());
  app.put('/api/browser/settings', async (req) => {
    setBrowserSettings(db, B(req));
    return state();
  });
  app.post('/api/browser/download', async () => {
    void downloadChrome((dl) => {
      if (dl.state === 'done') forgetChromes();
      d.broadcast({ t: 'feature', id: 'browser', data: { type: 'download', download: dl } });
    });
    return state();
  });

  // Named profiles: a browser folder each, logged in by the user from Settings.
  app.post('/api/browser/profiles', async (req) => ({ profile: addProfile(db, String(B(req).name ?? '')), ...state() }));
  app.patch('/api/browser/profiles/:id', async (req) => {
    renameProfile(db, P(req).id, String(B(req).name ?? ''));
    return state();
  });
  app.delete('/api/browser/profiles/:id', async (req) => {
    const id = P(req).id;
    for (const b of openBrowsers()) if (b.profile === id) await b.close('its profile was removed');
    removeProfile(db, id);
    return state();
  });
  /** Opens a profile's own browser (outside any session) for the user to log in; its live view uses the returned key. */
  app.post('/api/browser/profiles/:id/open', async (req) => {
    const id = P(req).id;
    if (!profiles(db).some((p) => p.id === id)) throw new HttpError(404, 'No such profile');
    const key = profileKey(id);
    const b = await ensureBrowser(key, config.defaultCwd, id);
    const url = normalizeUrl(String(B(req).url ?? ''));
    if (url && /^https?:$/.test(url.protocol)) {
      const t = await b.tab();
      await t.navigate(url.href).catch(() => {});
    }
    await b.takeOver(true);
    return { key, view: b.view() };
  });

  // ---- a session's browser ----

  const key = (req: FastifyRequest) => decodeURIComponent(P(req).key);
  const own = (req: FastifyRequest) => {
    const b = browserOf(key(req));
    if (!b) throw new HttpError(404, 'The browser is not open');
    return b;
  };
  const cwdOf = (k: string) => d.sessions.summary(k)?.cwd || config.defaultCwd;

  app.get('/api/browser/sessions/:key', async (req) => ({ view: viewOf(key(req)), options: outsideSessions(key(req)) ? {} : sessionOptions(db, key(req)) }));
  app.patch('/api/browser/sessions/:key/options', async (req) => {
    const k = key(req);
    const before = sessionOptions(db, k).profile;
    const options = setSessionOptions(db, k, B(req));
    // Another profile: the browser starts again in it on next use.
    if ((options.profile ?? '') !== (before ?? '')) await browserOf(k)?.close('its profile changed');
    return { options, view: viewOf(k) };
  });

  /** The user opens the session's browser themselves (to log in before the agent starts, say). */
  app.post('/api/browser/sessions/:key/open', async (req) => {
    const k = key(req);
    if (!browserSettings(db).enabled) throw new HttpError(409, 'The browser is turned off in Settings → Browser');
    const b = await ensureBrowser(k, cwdOf(k));
    const url = normalizeUrl(String(B(req).url ?? ''));
    if (url && /^https?:$/.test(url.protocol)) await userNavigate(k, url);
    return { view: b.view() };
  });
  app.post('/api/browser/sessions/:key/close', async (req) => {
    await browserOf(key(req))?.close('closed by the user');
    emitView(key(req));
    return { ok: true };
  });
  app.post('/api/browser/sessions/:key/watch', async (req) => {
    const b = browserOf(key(req));
    if (!b) return { view: viewOf(key(req)) };
    const { w, h, viewer } = B(req);
    await b.watch(Number(w) || 1280, Number(h) || 800, String(viewer ?? '').slice(0, 20));
    return { view: b.view() };
  });
  app.post('/api/browser/sessions/:key/takeover', async (req) => {
    const b = own(req);
    const { on, fit } = B(req);
    await b.takeOver(!!on, fit && typeof fit === 'object' ? { w: Number(fit.w), h: Number(fit.h), scale: Number(fit.scale) || 2 } : undefined);
    return { view: b.view() };
  });
  app.post('/api/browser/sessions/:key/input', { bodyLimit: 512 * 1024 }, async (req) => {
    const b = own(req);
    const events = B(req).events;
    if (!Array.isArray(events)) throw new HttpError(400, 'events must be a list');
    if (b.driver !== 'user') throw new HttpError(409, 'Take over the browser first');
    await b.input(events as BrowserInput[]);
    return { ok: true };
  });

  /** The user goes somewhere (they drive): an address on this machine is theirs to allow, for the session. */
  async function userNavigate(k: string, url: URL) {
    const b = browserOf(k)!;
    const policy = b.policy();
    const why = await refusal(url.href, 'Document', policy, config.port);
    if (why) {
      if (!why.endsWith('is on this machine or its network') || !(await isPrivate(url))) throw new HttpError(403, `Not opened: ${why}`);
      if (!outsideSessions(k)) setSessionOptions(db, k, { local: [...(sessionOptions(db, k).local ?? []), hostPort(url)] });
      else throw new HttpError(403, `Not opened: ${why}`);
    }
    const t = await b.tab();
    const err = await t.navigate(url.href);
    if (err) throw new HttpError(502, `Could not open it: ${err}`);
  }
  app.post('/api/browser/sessions/:key/navigate', async (req) => {
    const b = own(req);
    if (b.driver !== 'user') throw new HttpError(409, 'Take over the browser first');
    const url = normalizeUrl(String(B(req).url ?? ''));
    if (!url || !/^https?:$/.test(url.protocol)) throw new HttpError(400, 'That is not a web address');
    await userNavigate(key(req), url);
    return { view: b.view() };
  });
  app.post('/api/browser/sessions/:key/nav', async (req) => {
    const b = own(req);
    if (b.driver !== 'user') throw new HttpError(409, 'Take over the browser first');
    const t = await b.tab();
    const what = String(B(req).do ?? '');
    if (what === 'back') await t.back();
    else if (what === 'forward') await t.forward();
    else if (what === 'reload') await t.reload();
    else throw new HttpError(400, 'back, forward or reload');
    return { view: b.view() };
  });
  app.post('/api/browser/sessions/:key/tab', async (req) => {
    const b = own(req);
    const t = b.tabs.find((x) => x.targetId === String(B(req).id ?? ''));
    if (!t) throw new HttpError(404, 'No such tab');
    b.setActive(t);
    b.changed();
    return { view: b.view() };
  });
  app.post('/api/browser/sessions/:key/dialog', async (req) => {
    const b = own(req);
    const { accept, text } = B(req);
    await b.answerDialog(!!accept, text === undefined ? undefined : String(text));
    return { view: b.view() };
  });
  app.post('/api/browser/sessions/:key/asks/:id', async (req) => {
    const k = key(req);
    const b = browserOf(k);
    const outcome = B(req).outcome === 'skipped' ? 'skipped' : 'done';
    const ask = b?.asks.find((a) => a.id === P(req).id);
    if (!b || !ask) throw new HttpError(404, 'That is no longer waiting');
    // Allowing an address on this machine: the session may reach it from now on.
    if (ask.kind === 'local' && outcome === 'done') setSessionOptions(db, k, { local: [...(sessionOptions(db, k).local ?? []), ask.text] });
    await b.answer(ask.id, outcome);
    return { view: b.view() };
  });

  /** A step's small picture, for its row in the conversation. */
  app.get('/api/browser/sessions/:key/steps/:n', async (req, reply) => {
    const f = stepFile(key(req), Number(String(P(req).n).replace(/\.jpg$/, '')));
    if (!f) return reply.code(404).send({ error: 'No picture for that step' });
    return reply.header('Cache-Control', 'private, max-age=604800, immutable').type('image/jpeg').send(fs.createReadStream(f));
  });
}
