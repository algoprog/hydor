// Script tests for what apps need and show beyond words: the keys an app needs (asked for before it runs, saved to
// the vault with its hosts, never travelling with it), pictures, videos and files in answers (taken in from this
// computer, served where a view's frame can reach them, and never able to run on the app's own address), an app's
// own files in its .hydor-app, a ready-made app's file coming back as itself, and views' widgets and libraries.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/media-test.ts
//   DATA_DIR=/tmp/hydor-test-media node dist/dev/media-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import type { AppRecipe } from '../../shared/apps.ts';
import { answerSchema, checkAnswer, cleanRecipe } from '../../shared/apps.ts';
import { cleanSecrets, secretsLine } from '../../shared/app-secrets.ts';
import { cleanLibs, cleanMedia, libsHead, LIB_CDN, MEDIA_PATH, mediaKind, videoEmbed } from '../../shared/app-media.ts';
import { checkUi, cleanUi } from '../../shared/app-ui.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { saveSecret, secretView, vaultTables } from '../connections/vault.ts';
import { MEDIA_SRC } from '../pages/media-kit.ts';
import { frameHtml } from '../pages/kit.ts';
import { isInstalled, setInstalled } from './builtins.ts';
import { apps } from './index.ts';
import { mediaTables, putAsset, refMedia, sweepMedia, takeInAnswer } from './media.ts';
import { installPackage, packageJson, packageOf, previewOf, readPackage, zipPackage } from './package.ts';
import { saveResult, startRun, startRuns } from './runs.ts';
import { missingSecrets, saveAppSecrets, secretsOf } from './secrets.ts';
import * as store from './store.ts';
import { TEMPLATES } from './templates.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-media-test-'));
const db = openDb(path.join(tmp, 'test.db'));
store.ensureTables(db);
vaultTables(db);
mediaTables(db);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sessions that start at once and work until told; cards answered as a test says. */
class FakeSessions extends EventEmitter {
  made: { key: string; o: any }[] = [];
  cards: any[] = [];
  answerWith: ((card: any) => any) | null = null;
  async create(o: any) {
    const key = `acp:fake-${this.made.length + 1}-${Math.random().toString(36).slice(2, 8)}`;
    this.made.push({ key, o });
    return key;
  }
  setFlags() {}
  summary(key: string) {
    return { key, agent: 'acp', stats: { tokensIn: 0, tokensOut: 0, tokensCached: 0 }, live: { status: 'working' } } as any;
  }
  async timeline() {
    return { parser: { items: [] }, readMore: async () => {} } as any;
  }
  liveSnapshot() {
    return { live: null, overlay: { items: [], patches: {}, approvals: [] } };
  }
  async interrupt() {}
  async deliverOrQueue() {}
  enqueue() {}
  adapterByRun() {
    return { ask: async (card: any) => (this.cards.push(card), this.answerWith ? this.answerWith(card) : null) } as any;
  }
}

const sessions = new FakeSessions();
const http = Fastify();
await http.register(cookie);
// As the app's server answers errors: their status, what else they say, and the message in words.
http.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ ...(err instanceof HttpError ? err.extra : undefined), error: err.message });
});
const deps = { app: http, db, sessions: sessions as any, scheduler: null as any, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
apps.routes!(deps);
startRuns(deps);
await http.ready();

const recipe = (p: Partial<AppRecipe> = {}): AppRecipe =>
  cleanRecipe({
    name: 'Weather report',
    agent: 'claude',
    prompt: 'The weather in {{city}}.',
    fields: [{ id: 'city', label: 'City', type: 'text', required: true }],
    answer: [{ id: 'summary', label: 'Summary', type: 'markdown', required: true }],
    tools: null,
    limits: {},
    cwd: tmp,
    secrets: [{ name: 'WEATHER_KEY', label: 'Weather API key', domains: ['api.weather.test'], url: 'https://weather.test/keys' }],
    ...p,
  });

// A small PNG (1×1, red).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');

// ---- the keys an app needs -------------------------------------------------------------------------------------

test('keys an app needs: names the vault takes, where each may go, each once; never a value', () => {
  const c = cleanSecrets([{ name: 'openweather api key', label: 'OpenWeather API key', domains: ['https://api.openweathermap.org/data/2.5'], url: 'https://home.openweathermap.org/api_keys', value: 'never-kept' }]);
  assert.deepEqual(c.errors, []);
  assert.deepEqual(c.secrets, [{ name: 'OPENWEATHER_API_KEY', label: 'OpenWeather API key', url: 'https://home.openweathermap.org/api_keys', domains: ['api.openweathermap.org'] }]);
  assert.match(cleanSecrets([{ name: 'X_KEY' }]).errors[0], /say where it may go/);
  assert.match(cleanSecrets([{ name: 'A_KEY', domains: ['a.test'] }, { name: 'a key', domains: ['b.test'] }]).errors[0], /there twice/);
  assert.match(cleanSecrets({ name: 'A' }).errors[0], /are a list/);
  assert.match(cleanSecrets([{ name: 'A_KEY', domains: ['a.test'], url: 'javascript:alert(1)' }]).errors[0], /web address/);
  // A recipe keeps them; they are part of what travels.
  assert.equal(recipe().secrets![0].name, 'WEATHER_KEY');
  assert.equal(JSON.stringify(recipe()).includes('never-kept'), false);
});

test('keys: a run without one it needs is refused with the keys to ask for; given with the form, it goes to the vault with the app’s hosts', async () => {
  const a = store.saveApp(db, { recipe: recipe() });
  const refused = await http.inject({ method: 'POST', url: `/api/apps/${a.id}/runs`, payload: { inputs: { city: 'Lisbon' } } });
  assert.equal(refused.statusCode, 409);
  const body = refused.json();
  assert.match(body.error, /Weather report needs a key first: Weather API key/);
  assert.deepEqual(body.secrets.map((s: any) => s.name), ['WEATHER_KEY']);
  // The page shows how it stands.
  const before = (await http.inject({ method: 'GET', url: `/api/apps/${a.id}` })).json();
  assert.deepEqual(before.secrets.map((s: any) => [s.name, s.have]), [['WEATHER_KEY', false]]);
  // Given with the form: saved first, then it runs.
  const ran = await http.inject({ method: 'POST', url: `/api/apps/${a.id}/runs`, payload: { inputs: { city: 'Lisbon' }, secrets: { WEATHER_KEY: 'wk_1234567890abcdef', OTHER_KEY: 'not-its-own' } } });
  assert.equal(ran.statusCode, 200, ran.body);
  const v = secretView(db, 'WEATHER_KEY')!;
  assert.deepEqual(v.domains, ['api.weather.test']);
  assert.match(v.note, /Weather report: Weather API key/);
  assert.equal(secretView(db, 'OTHER_KEY'), null, 'only the keys it names are saved');
  const after = (await http.inject({ method: 'GET', url: `/api/apps/${a.id}` })).json();
  assert.equal(after.secrets[0].have, true);
  assert.match(after.secrets[0].hint, /cdef$/);
  assert.equal(JSON.stringify(after).includes('wk_1234567890abcdef'), false, 'a value never comes back');
  // Its run is told the key's name and how to use it.
  assert.match(secretsLine(secretsOf(db, a))!, /WEATHER_KEY \(Weather API key\): use it in http_request \(auth: "WEATHER_KEY"/);
  store.deleteApp(db, a.id);
  store.deleteRuns(db, a.id);
});

test('keys: one it can do without does not stop a run; a key the vault has keeps its own hosts unless the app is let send it to its own', () => {
  const r = recipe({ secrets: [{ name: 'MAPS_KEY', label: 'Maps key', domains: ['maps.test'], optional: true }] } as Partial<AppRecipe>);
  assert.deepEqual(missingSecrets(db, r), []);
  saveSecret(db, { name: 'SHARED_TOKEN', value: 'tok_abcdefabcdef1234', domains: ['one.test'] });
  const r2 = recipe({ secrets: [{ name: 'SHARED_TOKEN', label: 'Token', domains: ['two.test'] }] } as Partial<AppRecipe>);
  assert.deepEqual(secretsOf(db, r2)[0].blocked, ['two.test']);
  saveAppSecrets(db, r2, { SHARED_TOKEN: 'tok_new_value_99999' });
  assert.deepEqual(secretView(db, 'SHARED_TOKEN')!.domains, ['one.test'], 'a new value alone leaves its hosts');
  saveAppSecrets(db, r2, {}, { allow: ['SHARED_TOKEN'] });
  assert.deepEqual(secretView(db, 'SHARED_TOKEN')!.domains, ['one.test', 'two.test']);
  assert.equal(secretsOf(db, r2)[0].blocked, undefined);
});

test('keys: an agent running the app (use_app) gets its card with the key to give; the run starts once the vault has it', async () => {
  const a = store.saveApp(db, { recipe: recipe({ name: 'Forecast', secrets: [{ name: 'FORECAST_KEY', label: 'Forecast key', domains: ['forecast.test'] }] } as Partial<AppRecipe>) });
  const key = 'claude:asker-keys';
  sessions.cards = [];
  // The card saves the key to the vault (as the page does), then answers.
  sessions.answerWith = () => {
    saveSecret(db, { name: 'FORECAST_KEY', value: 'fk_000000000000', domains: ['forecast.test'] });
    return { decision: 'accept', form: {} };
  };
  const ctx: RunCtx = { runId: `run-${key}`, key, agent: 'claude', cwd: tmp, deps };
  const tool = apps.tools!(ctx).find((t) => t.name === 'use_app')!;
  const going = tool.run({ app: 'forecast', inputs: { city: 'Oslo' }, wait: 1 }, ctx);
  await sleep(200);
  const card = sessions.cards[0];
  assert.ok(card, 'the card shows although the request gave everything the form asks');
  assert.deepEqual(card.app.secrets, [{ name: 'FORECAST_KEY', label: 'Forecast key' }]);
  assert.match(String(await going), /still running|is done/);
  assert.ok(store.listRuns(db, { app: a.id, limit: 3 }).some((r) => r.source === 'session'));
  sessions.answerWith = null;
  store.deleteApp(db, a.id);
  store.deleteRuns(db, a.id);
});

// ---- pictures, videos and files in answers ----------------------------------------------------------------------

test('media answers: addresses, items with captions, files on this computer; a public run’s answer only the web', () => {
  const answer = cleanRecipe({ answer: [{ id: 'photos', label: 'Photos', type: 'media' }, { id: 'places', label: 'Places', type: 'table', columns: [{ id: 'name', label: 'Name', type: 'text' }, { id: 'photo', label: 'Photo', type: 'image' }] }] }).answer;
  assert.deepEqual(answer.map((f) => f.type), ['media', 'table']);
  assert.equal(answer[1].columns![1].type, 'image');
  const ok = checkAnswer(answer, { photos: ['https://x.test/a.jpg', { src: './pic.png', caption: 'Pic' }], places: [{ name: 'Belém', photo: '~/Pictures/belem.jpg' }] });
  assert.ok(ok.ok);
  assert.deepEqual((ok as any).value.photos, [{ src: 'https://x.test/a.jpg' }, { src: './pic.png', caption: 'Pic' }]);
  const pub = checkAnswer(answer, { photos: ['/etc/passwd'] }, { local: false });
  assert.ok(!pub.ok && /not a web address/.test(pub.errors[0]));
  assert.ok(!checkAnswer(answer, { photos: [{ caption: 'no src' }] }).ok);
  const schema = answerSchema(answer) as any;
  assert.equal(schema.properties.photos.type, 'array');
  assert.deepEqual(schema.properties.photos.items.required, ['src']);
  assert.match(schema.properties.places.items.properties.photo.description, /path of a file on this computer/);
  assert.equal(mediaKind('https://youtu.be/dQw4w9WgXcQ'), 'video');
  assert.equal(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42');
  assert.equal(videoEmbed('https://vimeo.com/123456789'), 'https://player.vimeo.com/video/123456789');
  assert.deepEqual(cleanMedia('asset:cover.jpg').items, [{ src: 'asset:cover.jpg' }]);
});

test('media taken in: a file on this computer and a picture written out get a copy kept here; a missing file says so', async () => {
  fs.writeFileSync(path.join(tmp, 'pic.png'), PNG);
  fs.writeFileSync(path.join(tmp, 'page.html'), '<script>alert(1)</script>');
  const answer = cleanRecipe({ answer: [{ id: 'photos', label: 'Photos', type: 'media' }, { id: 'files', label: 'Files', type: 'media' }] }).answer;
  const got = await takeInAnswer(db, answer, { photos: [{ src: 'pic.png', caption: 'Red' }, { src: `data:image/png;base64,${PNG.toString('base64')}` }, { src: 'https://videos.test/clip.mp4' }], files: [{ src: './page.html' }] }, { cwd: tmp, local: true });
  assert.deepEqual(got.errors, []);
  const photos = got.value.photos as any[];
  assert.match(photos[0].src, MEDIA_PATH);
  assert.equal(MEDIA_PATH.exec(photos[0].src)![1], MEDIA_PATH.exec(photos[1].src)![1], 'the same bytes are kept once');
  assert.deepEqual([photos[0].kind, photos[0].name, photos[0].caption], ['image', 'pic.png', 'Red']);
  assert.equal(photos[2].src, 'https://videos.test/clip.mp4', 'a video on the web stays a link');
  const missing = await takeInAnswer(db, answer, { photos: [{ src: 'nope.png' }] }, { cwd: tmp, local: true });
  assert.match(missing.errors[0], /there is no file at nope\.png/);
  const pub = await takeInAnswer(db, answer, { photos: [{ src: 'pic.png' }] }, { cwd: tmp, local: false });
  assert.match(pub.errors[0], /only a web address/);
  // Served where a view's frame reaches it: its type, in parts for a player, and never as a page of this app.
  const res = await http.inject({ method: 'GET', url: photos[0].src });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'image/png');
  assert.match(String(res.headers['content-security-policy']), /^sandbox;/);
  assert.match(String(res.headers['content-disposition']), /^inline/);
  assert.equal(res.rawPayload.length, PNG.length);
  const part = await http.inject({ method: 'GET', url: photos[0].src, headers: { range: 'bytes=0-9' } });
  assert.equal(part.statusCode, 206);
  assert.equal(part.rawPayload.length, 10);
  const html = await http.inject({ method: 'GET', url: (got.value.files as any[])[0].src });
  assert.match(String(html.headers['content-disposition']), /^attachment/, 'a web page downloads instead of opening');
  assert.equal((await http.inject({ method: 'GET', url: `/app-media/${'0'.repeat(40)}/x.png` })).statusCode, 404);
});

test('media kept while what shows it is: a run’s files go a day after the run', async () => {
  const a = store.saveApp(db, { recipe: recipe({ secrets: undefined, answer: [{ id: 'photos', label: 'Photos', type: 'media' }] } as Partial<AppRecipe>) });
  const r = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'api', inputs: { city: 'Rome' } });
  fs.writeFileSync(path.join(tmp, 'rome.png'), Buffer.concat([PNG, Buffer.from('rome')]));
  const got = await takeInAnswer(db, a.answer, { photos: [{ src: 'rome.png' }] }, { cwd: tmp, local: true });
  saveResult(r.id, got.value);
  const sha = MEDIA_PATH.exec((got.value.photos as any[])[0].src)![1];
  const old = () => db.prepare('update app_media set created_at = 0 where sha = ?').run(sha);
  old();
  sweepMedia(db);
  assert.equal((await http.inject({ method: 'GET', url: (got.value.photos as any[])[0].src })).statusCode, 200, 'kept while its run is');
  await sleep(100);
  store.deleteRun(db, r.id);
  old();
  sweepMedia(db);
  assert.equal((await http.inject({ method: 'GET', url: (got.value.photos as any[])[0].src })).statusCode, 404, 'gone with its run');
  store.deleteApp(db, a.id);
});

// ---- an app's own files, and its .hydor-app ---------------------------------------------------------------------

test('an app’s own files: kept by name, packed in its .hydor-app under assets/, installed with it; its keys travel by name only', async () => {
  const cover = await putAsset(db, 'cover.png', { data: PNG }, 'The cover');
  const a = store.saveApp(db, { recipe: recipe({ name: 'Postcards', assets: { 'cover.png': cover } } as Partial<AppRecipe>) });
  saveSecret(db, { name: 'WEATHER_KEY', value: 'wk_secret_value_1', domains: ['api.weather.test'] });
  const pkg = packageOf(db, a, false);
  assert.deepEqual(Object.keys(pkg.files ?? {}), ['cover.png']);
  const zip = zipPackage(pkg);
  assert.equal(zip.includes(Buffer.from('wk_secret_value_1')), false, 'no key travels');
  const back = readPackage({ file: { name: 'postcards.hydor-app', data: zip.toString('base64') } });
  assert.ok(back.files?.['cover.png']?.equals(PNG), 'its file comes back from assets/');
  const { preview } = await previewOf(db, back);
  assert.deepEqual(preview.files.map((f) => [f.name, f.mime, f.bytes]), [['cover.png', 'image/png', PNG.length]]);
  assert.deepEqual(preview.secrets.map((s) => [s.name, s.have]), [['WEATHER_KEY', true]]);
  const out = await installPackage(db, back);
  assert.equal(out.app!.assets!['cover.png'].sha, cover.sha);
  // Kept while an app shows it, however old.
  db.prepare('update app_media set created_at = 0 where sha = ?').run(cover.sha);
  sweepMedia(db);
  assert.equal((await http.inject({ method: 'GET', url: `/app-media/${cover.sha}/cover.png` })).statusCode, 200, 'an app’s own file stays while the app does');
  assert.equal(out.app!.assets!['cover.png'].caption, 'The cover');
  // As one .json, its files as base64.
  const json = JSON.parse(packageJson(pkg));
  assert.equal(typeof json.files['cover.png'], 'string');
  assert.ok(readPackage({ package: json }).files?.['cover.png']?.equals(PNG));
  // A file it names that is not in the package is left out, and said so.
  const { files: _f, ...without } = back;
  const p2 = await previewOf(db, without);
  assert.ok(p2.preview.notes.some((n) => /“cover\.png” is not in the package/.test(n)));
  // Through the routes: download, and install from it.
  const dl = await http.inject({ method: 'GET', url: `/api/apps/${a.id}/export` });
  assert.equal(dl.statusCode, 200);
  assert.ok(readPackage({ file: { data: dl.rawPayload.toString('base64') } }).files?.['cover.png']);
  store.deleteApp(db, a.id);
  store.deleteApp(db, out.app!.id);
  // Gone a day after the last app that showed it.
  db.prepare('update app_media set created_at = 0 where sha = ?').run(cover.sha);
  sweepMedia(db);
  assert.equal((await http.inject({ method: 'GET', url: `/app-media/${cover.sha}/cover.png` })).statusCode, 404);
});

test('a ready-made app’s file says which it is: installing it brings back the one you uninstalled, or makes a copy of your own', async () => {
  const t = TEMPLATES.find((x) => !x.block)!;
  const dl = await http.inject({ method: 'GET', url: `/api/apps/tpl:${t.id}/export` });
  assert.equal(dl.statusCode, 200);
  const pkg = readPackage({ file: { data: dl.rawPayload.toString('base64') } });
  assert.equal(pkg.builtin, t.id);
  setInstalled(db, t.id, false);
  const { preview } = await previewOf(db, pkg);
  assert.deepEqual(preview.builtin, { id: t.id, installed: false });
  const back = await installPackage(db, pkg);
  assert.equal(back.builtin, t.id);
  assert.equal(isInstalled(db, t.id), true);
  const copy = await installPackage(db, pkg);
  assert.ok(copy.app && copy.app.name === t.name, 'installed already: a copy of your own');
  store.deleteApp(db, copy.app!.id);
});

// ---- views: media elements, widgets and their libraries ---------------------------------------------------------

test('views: pictures, videos, sounds, maps and plots are built-in elements; widgets draw with code of their own and import exact versions', () => {
  const ui = {
    pages: [
      {
        id: 'main',
        title: 'Trip',
        blocks: [
          { element: 'map', data: 'result.stops', with: { lat: 'lat', lng: 'lng', label: 'name', line: true } },
          { element: 'plot', data: 'result.costs', with: { kind: 'bar', x: 'day', y: 'cost' } },
          { element: 'image', data: 'result.photos' },
          { element: 'video', data: 'result.clip' },
          { element: 'globe', data: 'result.stops' },
        ],
      },
    ],
    widgets: { globe: { code: 'import * as THREE from "three";\nexport default function (el, value, view) { el.textContent = String(value.length); }', css: 'canvas{width:100%}', height: '360px' } },
    libs: { three: '0.170.0', 'leaflet/dist/leaflet.css': '1.9.4' },
  };
  const c = cleanUi(ui);
  assert.deepEqual(c.errors, []);
  assert.equal(c.ui!.widgets!.globe.height, '360px');
  const r = cleanRecipe({ name: 'Trip', prompt: 'x', answer: [{ id: 'stops', label: 'Stops', type: 'table', columns: [{ id: 'name', label: 'Name', type: 'text' }] }, { id: 'costs', label: 'Costs', type: 'table' }, { id: 'photos', label: 'Photos', type: 'media' }, { id: 'clip', label: 'Clip', type: 'media' }], ui });
  assert.deepEqual(checkUi(r).errors, []);
  assert.match(cleanUi({ ...ui, libs: { three: '^0.170.0' } }).errors.join(' '), /exact version/);
  assert.match(cleanUi({ ...ui, widgets: { globe: { code: 'function draw() {}' } } }).errors.join(' '), /exports the function/);
  assert.match(cleanUi({ ...ui, widgets: { map: { code: 'export default () => {}' } } }).errors.join(' '), /an element has that name/);
  assert.match(cleanUi({ pages: ui.pages.slice(0, 1).map((p) => ({ ...p, blocks: p.blocks.slice(0, 1) })), libs: { three: '0.170.0' } }).errors.join(' '), /no widgets to use them/);
  assert.deepEqual(cleanLibs({ 'evil pkg': '1.0.0' }).libs, undefined);
  const head = libsHead({ three: '0.170.0', 'chart.js/auto': '4.4.6', 'leaflet/dist/leaflet.css': '1.9.4' });
  assert.equal(head.imports.three, `${LIB_CDN}three@0.170.0/+esm`);
  assert.equal(head.imports['three/'], `${LIB_CDN}three@0.170.0/`);
  assert.equal(head.imports['chart.js/auto'], `${LIB_CDN}chart.js@4.4.6/auto/+esm`);
  assert.deepEqual(head.css, [`${LIB_CDN}leaflet@1.9.4/dist/leaflet.css`]);
  // The view's files show by name.
  assert.ok(cleanRecipe({ assets: { 'cover.png': { sha: 'a'.repeat(40), mime: 'image/png', bytes: 10 }, '../evil': { sha: 'b'.repeat(40), mime: 'x', bytes: 1 } } }).assets!['cover.png']);
  assert.equal(cleanRecipe({ assets: { '../evil': { sha: 'b'.repeat(40), mime: 'x', bytes: 1 } } }).assets, undefined);
});

test('the frame’s media parts: their source runs as sent, and the frame passes them to the view’s kit', () => {
  const fn = new Function(`return (${MEDIA_SRC})`)();
  assert.equal(typeof fn, 'function');
  const page = frameHtml();
  assert.ok(page.includes('n-plot') && page.includes('n-map') && page.includes('n-widget'));
  assert.ok(page.includes(`${LIB_CDN}leaflet@`), 'where the map library comes from');
  // The map itself is OpenFreeMap's, drawn by MapLibre: OpenStreetMap's own tile servers refuse a sandboxed frame.
  assert.ok(page.includes(`${LIB_CDN}maplibre-gl@5.`) && page.includes(`${LIB_CDN}@maplibre/maplibre-gl-leaflet@`), 'MapLibre 5 (its one-file build) and its Leaflet layer');
  assert.ok(page.includes('https://tiles.openfreemap.org/styles/positron') && page.includes('https://tiles.openfreemap.org/styles/dark'), 'a light and a dark map');
  assert.ok(page.includes('OpenFreeMap') && page.includes('openstreetmap.org/copyright'), 'its credit');
  assert.ok(!page.includes('tile.openstreetmap.org'), 'no tiles from OpenStreetMap’s own servers');
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed} of ${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
