// Script test for the ready-made app "Explore a place" (place-explorer, in templates-more.ts): its programs run in the
// sandbox on what the services answered once for Research Triangle Park with "Dog parks" at 10 km (Open-Meteo's search,
// Wikidata, Wikipedia, and OpenStreetMap's Overpass, trimmed, in fixtures/places), then the app runs whole through the
// flow runner with stand-ins for the services and the model: the kinds of place they asked for come first, a busy
// Overpass falls back to another and a dead one leaves the Wikipedia answer, and without interests it asks nothing of
// OpenStreetMap. With LIVE=1 the services are asked for real (RECORD=/some/folder saves what each answered).
// Build and run with scratch folders:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/apps/places-test.ts
//   DATA_DIR=/tmp/hydor-test-places HYDOR_APPS_DIR=/tmp/hydor-test-places-apps node dist/dev/places-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { allSteps, evalRule, type CodeStep } from '../../shared/app-manifest.ts';
import { HttpError } from '../auth.ts';
import { APP_ROOT } from '../config.ts';
import { openDb } from '../db.ts';
import { registerFeatures } from '../features/registry.ts';
import type { Deps, Feature, RunTool } from '../features/types.ts';
import { setHelperModel } from '../helper.ts';
import { AGENT_FILE } from '../models/config.ts';
import { Scheduler } from '../scheduler.ts';
import type { SessionManager } from '../sessions.ts';
import { runCode } from './code.ts';
import { scopeOfRun } from './examples.ts';
import { apps } from './index.ts';
import { startRun, startRuns, waitFor } from './runs.ts';
import * as store from './store.ts';
import { templateById } from './templates.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || !process.env.HYDOR_APPS_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… and HYDOR_APPS_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
const LIVE = process.env.LIVE === '1';
const RECORD = process.env.RECORD;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-places-test-'));
const db = openDb(path.join(tmp, 'test.db'));
store.ensureTables(db);
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const fixture = (name: string) => fs.readFileSync(path.join(APP_ROOT, 'server/apps/fixtures/places', name), 'utf8');
const T = templateById('place-explorer')!;

// ---- the services, as they answered once --------------------------------------------------------------------------

/** What http_request gives: its status line, a blank line, the body. */
const answer = (url: string, body: string) => ({ text: `HTTP 200 OK  ·  ${new URL(url).host}  ·  ${body.length} bytes\n\n${body}` });

/** What each service answers; a route returns the body, or null when it does not answer (as a 502 does). */
type Route = (url: URL, a: Record<string, unknown>) => string | null;
let routes: Route[] = [];
const asked: { url: URL; a: Record<string, unknown> }[] = [];
let recorded = 0;
async function http(a: Record<string, unknown>): Promise<{ text: string }> {
  const url = new URL(String(a.url));
  if (LIVE) {
    const r = await fetch(url, { method: String(a.method ?? 'GET'), headers: a.headers as Record<string, string>, body: a.body as string | undefined, signal: AbortSignal.timeout(60_000) });
    const body = await r.text();
    if (RECORD) fs.writeFileSync(path.join(RECORD, `${++recorded}-${url.host}.txt`), body);
    if (r.status >= 400) throw new Error(`http_request: HTTP ${r.status} ${r.statusText}  ·  ${url.host}`);
    return answer(url.href, body);
  }
  asked.push({ url, a });
  for (const route of routes) {
    const got = route(url, a);
    if (got !== null) return answer(url.href, got);
  }
  throw new Error(`http_request: HTTP 502 Bad Gateway  ·  ${url.host}`);
}
const meteo: Route = (u) => (u.host === 'geocoding-api.open-meteo.com' ? fixture('meteo.json') : null);
const nominatim: Route = (u) => (u.host === 'nominatim.openstreetmap.org' ? fixture('nominatim.json') : null);
const wikidata: Route = (u) => (u.host === 'query.wikidata.org' ? fixture('wikidata.json') : null);
const wikipedia: Route = (u) => (u.host === 'en.wikipedia.org' && u.searchParams.get('generator') === 'geosearch' ? fixture('wikipedia.json') : u.host === 'en.wikipedia.org' ? '{"query":{"pages":[]}}' : null);
const overpass = (host: string): Route => (u) => (u.host === host ? fixture('overpass.json') : null);
const everything = [meteo, nominatim, wikidata, wikipedia, overpass('overpass-api.de')];

/** A template's code step, run in the sandbox on the input given, with its ctx calls going to the stand-in services. */
async function program(step: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const s = allSteps(T.flow!.steps).find((x) => x.id === step) as CodeStep | undefined;
  assert.ok(s && s.do === 'code', `place-explorer has a program “${step}”`);
  const out = await runCode({
    language: s.language,
    code: s.code,
    input,
    slug: 'place-explorer',
    seconds: s.seconds ?? 20,
    onCall: async (kind, args) => {
      if (kind === 'tool' && args.tool === 'http_request') return http((args.with ?? {}) as Record<string, unknown>);
      throw new Error(`ctx has no ${kind} here`);
    },
  });
  return out.values;
}

type Place = { name: string; kind: string; about: string; km: number; lat: number; lng: number; picture: string | null; link: string; why?: string; pick?: boolean };
const TAGS = [{ key: 'leisure', value: 'dog_park', label: 'Dog park' }];
const spotInput = { found: JSON.parse(fixture('meteo.json')), place: 'Research Triangle Park, NC', radius: 'The wider area (10 km)' };

// ---- the programs ----------------------------------------------------------------------------------------------------

test('Explore a place: the place and its radius found, then the kinds of place asked for from the main Overpass server', async () => {
  routes = [nominatim, meteo];
  const spot = await program('spot', spotInput);
  assert.equal(spot.km, 10);
  assert.equal(spot.label, 'Research Triangle Park, United States');
  asked.length = 0;
  routes = [overpass('overpass-api.de')];
  const osm = await program('osm', { tags: TAGS, lat: spot.lat, lng: spot.lng, km: spot.km });
  assert.equal(asked.length, 1, 'one question');
  const q = String(asked[0].a.body);
  assert.equal(asked[0].a.method, 'POST');
  assert.equal(asked[0].url.host, 'overpass-api.de');
  assert.equal((asked[0].a.headers as Record<string, string>)['User-Agent'].startsWith('Hydor'), true);
  assert.match(decodeURIComponent(q), /^data=\[out:json\]\[timeout:20\];\(nwr\["leisure"="dog_park"\]\(around:10000,35\.89709,-78\.86029\);\);out center tags 200;$/);
  const found = osm.found as Record<string, any>[];
  assert.ok(found.length >= 3);
  assert.ok(found.every((f) => f.label === 'Dog park' && !/^(?:private|no|customers)$/.test(f.access)), 'only dog parks anyone may go to');
  assert.deepEqual(
    found.map((f) => f.km),
    found.map((f) => f.km).sort((a, b) => a - b),
    'nearest first',
  );
  const bark = found.find((f) => f.name === 'Bark Park')!;
  assert.equal(bark.hours, 'Mo-Su 10:00-21:00');
  assert.equal(bark.type, 'way');
  assert.ok(!found.some((f) => f.name === 'Copper Run Dog Park' || f.name === 'The Providence Dog Park'), 'a private one is left out');
  assert.ok(found.filter((f) => f.unnamed).every((f) => f.name === 'Dog park'), 'the unnamed ones are called by their kind');
  assert.ok(found.filter((f) => f.unnamed).length <= 5);
});

test('Explore a place: when the main server is busy the other one answers; when none does it finds nothing, and the answer comes from Wikipedia', async () => {
  routes = [overpass('overpass.openstreetmap.fr')];
  asked.length = 0;
  const osm = await program('osm', { tags: TAGS, lat: 35.89709, lng: -78.86029, km: 10 });
  assert.deepEqual(asked.map((x) => x.url.host), ['overpass-api.de', 'overpass.openstreetmap.fr']);
  assert.ok((osm.found as unknown[]).length >= 3);
  // A server out of time answers with a remark and what it had: that is no answer either.
  routes = [(u) => (u.host === 'overpass-api.de' ? '{"elements":[],"remark":"runtime error: Query timed out in \\"query\\" at line 1"}' : null), overpass('overpass.openstreetmap.fr')];
  asked.length = 0;
  assert.ok(((await program('osm', { tags: TAGS, lat: 35.89709, lng: -78.86029, km: 10 })).found as unknown[]).length >= 3);
  assert.equal(asked.length, 2);
  routes = [];
  assert.deepEqual((await program('osm', { tags: TAGS, lat: 35.89709, lng: -78.86029, km: 10 })).found, []);
  // Tags that are no tags (a model's slip) are never put in the question.
  asked.length = 0;
  routes = everything;
  const none = await program('osm', { tags: [{ key: 'leisure"](around:1);node["a', value: 'x', label: 'Oops' }], lat: 35.9, lng: -78.9, km: 3 });
  assert.deepEqual(none.found, []);
  assert.equal(asked.length, 0);
});

test('Explore a place: what they asked for comes first, as places with their own kind, plain words, a link and a picture', async () => {
  routes = everything;
  asked.length = 0;
  const found = (await program('osm', { tags: TAGS, lat: 35.89709, lng: -78.86029, km: 10 })).found;
  const out = await program('sort', { famous: fixture('wikidata.json'), found: fixture('wikipedia.json'), osm: found, name: 'Research Triangle Park', lat: 35.89709, lng: -78.86029 });
  const places = out.places as Place[];
  assert.ok(places.length <= 40);
  const dogs = places.filter((p) => p.kind === 'Dog park');
  assert.ok(dogs.length >= 3);
  assert.deepEqual(
    places.slice(0, dogs.length).map((p) => p.kind),
    dogs.map(() => 'Dog park'),
    'the dog parks first',
  );
  assert.deepEqual(
    dogs.map((p) => p.km),
    dogs.map((p) => p.km).sort((a, b) => a - b),
    'nearest first',
  );
  assert.ok(places.length > dogs.length, 'then what is best known');
  const bark = places.find((p) => p.name === 'Bark Park')!;
  assert.equal(bark.about, 'Open Mo–Su 10:00–21:00');
  assert.equal(bark.link, 'https://www.openstreetmap.org/way/965964098');
  assert.equal(bark.picture, null);
  const arbors = places.find((p) => p.name === 'Carolina Arbors Small Dog Park')!;
  assert.equal(arbors.about, 'run by Carolina Arbors');
  const unnamed = dogs.find((p) => p.name === 'Dog park')!;
  assert.match(unnamed.about, /No name on the map/);
  assert.ok(dogs.every((p) => !/[=]/.test(p.about)), 'no raw tags');
  const list = String(out.list).split('\n');
  assert.match(list[0], /^1\. .*\(Dog park, .*; what they asked for\)$/);
  assert.ok(!/what they asked for/.test(list[list.length - 1]), 'the sights are not marked');
});

test('Explore a place: a place Wikipedia has as well is one; pictures from an image tag or a Commons file; links from the website, then Wikipedia', async () => {
  const osm = (o: Record<string, unknown>) => ({ type: 'node', id: '1', unnamed: false, hours: '', website: '', operator: '', fee: '', access: '', image: '', commons: '', wikidata: '', wikipedia: '', label: 'Café', ...o });
  const wikiPage = { title: 'Blue Cup Coffee', description: 'a coffee house', coordinates: [{ lat: 35.8975, lon: -78.8606, type: 'landmark' }], length: 5000, fullurl: 'https://en.wikipedia.org/wiki/Blue_Cup_Coffee', thumbnail: { source: 'https://upload.wikimedia.org/blue-cup.jpg' } };
  const rows = [
    osm({ id: '1', name: 'Blue Cup', lat: 35.8971, lng: -78.8603, km: 0.1 }),
    osm({ id: '2', name: 'Far Cup', lat: 35.91, lng: -78.87, km: 1.5, website: 'farcup.example/menu', image: 'https://img.example/far.jpg', fee: 'no', access: 'permit' }),
    osm({ id: '3', name: 'Old Roast', lat: 35.89, lng: -78.85, km: 1.1, wikipedia: 'de:Alte Rösterei', commons: 'File:Old roast.jpg' }),
    osm({ id: '4', name: 'Mail Only', lat: 35.88, lng: -78.86, km: 1.8, image: 'javascript:alert(1)', hours: 'Mo-Fr 08:00-18:00; PH off', operator: 'Cup Co' }),
  ];
  routes = [(u) => (u.host === 'en.wikipedia.org' ? '{"query":{"pages":[]}}' : null)];
  const out = await program('sort', { famous: '', found: JSON.stringify({ query: { pages: [wikiPage] } }), osm: rows, name: 'X', lat: 35.89709, lng: -78.86029 });
  const places = out.places as Place[];
  assert.deepEqual(places.map((p) => p.name), ['Blue Cup', 'Old Roast', 'Far Cup', 'Mail Only'], 'the nearest first; Blue Cup and its Wikipedia article are one place');
  assert.equal(places[0].kind, 'Café');
  assert.equal(places[0].link, 'https://en.wikipedia.org/wiki/Blue_Cup_Coffee');
  assert.equal(places[0].picture, 'https://upload.wikimedia.org/blue-cup.jpg');
  assert.equal(places[0].about, 'a coffee house');
  assert.equal(places[1].link, 'https://de.wikipedia.org/wiki/Alte_R%C3%B6sterei');
  assert.equal(places[1].picture, 'https://commons.wikimedia.org/wiki/Special:FilePath/Old%20roast.jpg?width=330');
  assert.equal(places[2].link, 'https://farcup.example/menu');
  assert.equal(places[2].picture, 'https://img.example/far.jpg');
  assert.equal(places[2].about, 'Free · Permit needed');
  assert.equal(places[3].picture, null, 'only an http or https address');
  assert.equal(places[3].about, 'Open Mo–Fr 08:00–18:00, public holidays closed · run by Cup Co');
});

test('Explore a place: nothing at all (not on Wikipedia, Wikidata or OpenStreetMap) is an error; OpenStreetMap alone is enough', async () => {
  routes = [];
  await assert.rejects(program('sort', { famous: '', found: '', osm: [], name: 'X', lat: 1, lng: 1 }), /Nothing around it is on Wikipedia, Wikidata or OpenStreetMap/);
  const out = await program('sort', { famous: '', found: '', osm: [{ name: 'Bark Park', label: 'Dog park', type: 'way', id: '9', lat: 35.9, lng: -78.86, unnamed: false }], name: 'X', lat: 35.89709, lng: -78.86029 });
  assert.equal((out.places as Place[]).length, 1);
});

// ---- the app, whole ------------------------------------------------------------------------------------------------

class FakeSessions extends EventEmitter {
  async create() {
    return 'acp:none';
  }
  summary() {
    return null;
  }
  setFlags() {}
  liveSnapshot() {
    return { live: null, overlay: { items: [], patches: {}, approvals: [] } };
  }
  async timeline() {
    return { parser: { items: [] }, readMore: async () => {} } as any;
  }
}

/** The model's answers, by what was asked; each question kept. */
const questions: string[] = [];
let kinds: unknown = { tags: TAGS };
const srv = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const user = String(b.messages?.find((m: { role: string }) => m.role === 'user')?.content ?? '');
    questions.push(user);
    let reply: unknown;
    if (/Which kinds of place on OpenStreetMap/.test(user)) reply = kinds;
    else {
      // Picks the places the list marks as asked for, as the pick step tells it to, then the first sights.
      const lines = [...user.matchAll(/^(\d+)\. (.*)$/gm)];
      const mine = lines.filter((m) => /what they asked for/.test(m[2])).map((m) => Number(m[1]));
      const n = (mine.length ? mine : lines.map((m) => Number(m[1]))).slice(0, 8);
      reply = { picks: n.map((i) => ({ n: i, why: `Number ${i} is worth the walk.` })), summary: 'A place to walk.' };
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(reply) }, finish_reason: 'stop' }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.001 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
fs.mkdirSync(path.dirname(AGENT_FILE), { recursive: true });
fs.writeFileSync(AGENT_FILE, JSON.stringify({ models: [{ id: 'fake', label: 'Fake', provider: 'endpoint', baseUrl: `http://127.0.0.1:${(srv.address() as { port: number }).port}/v1`, model: 'fake-1', tools: 'native' }] }));

const stepTool = (name: string, run: RunTool['run']): RunTool => ({ name, description: name, inputSchema: { type: 'object' }, run });
const services: Feature = { id: 'places-services', tools: (ctx) => (ctx.step ? [stepTool('http_request', (a) => http(a))] : []) };
const app = Fastify();
await app.register(cookie);
app.setErrorHandler((err: Error, _req, res) => {
  res.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
const sessions = new FakeSessions();
const scheduler = new Scheduler(db, sessions as unknown as SessionManager);
const deps = { app, db, sessions: sessions as any, scheduler, models: null as any, broadcast: () => {}, toSubscribers: () => {}, publicBase: () => 'http://test.local' } as Deps;
apps.routes!(deps);
registerFeatures([services], deps);
startRuns(deps);
await app.ready();
setHelperModel(db, 'fake');

const run = async (inputs: Record<string, string>) => {
  const r = (await waitFor(startRun({ app: 'tpl:place-explorer', slug: 'place-explorer', recipe: T, source: 'web', inputs }).id, 120_000))!;
  return { r, res: r.result as Record<string, any>, steps: store.listSteps(db, r.id) };
};
const DOGS = { place: 'Research Triangle Park, NC', interests: 'Dog parks', radius: 'The wider area (10 km)' };

test('Explore a place, whole: "Dog parks" are found on OpenStreetMap, come first in the picks and the places, and the example checks hold', async () => {
  routes = everything;
  questions.length = 0;
  asked.length = 0;
  const { r, res } = await run(DOGS);
  assert.equal(r.status, 'done', r.error);
  const places = res.places as Place[];
  assert.equal(places[0].kind, 'Dog park');
  assert.equal(places[0].pick, true);
  assert.ok(places.slice(0, 3).every((p) => p.kind === 'Dog park' && p.pick), 'the dog parks are the picks');
  assert.ok(places.some((p) => p.name === 'Bark Park' && p.why));
  assert.ok(res.stops >= 3);
  const pick = questions.find((q) => /^1\. /m.test(q))!;
  assert.match(pick, /marked "what they asked for"/);
  assert.match(pick, /^1\. .*what they asked for/m);
  assert.equal(asked.filter((x) => /overpass/.test(x.url.host)).length, 1);
  const ex = T.examples!.find((e) => e.id === 'dog-parks')!;
  assert.deepEqual(ex.inputs, DOGS);
  for (const rule of ex.checks!) assert.equal(evalRule(rule, scopeOfRun(db, r)), true, rule);
});

test('Explore a place, whole: Overpass down, the answer still comes from Wikipedia and Wikidata', async () => {
  routes = [meteo, nominatim, wikidata, wikipedia];
  const { r, res, steps } = await run(DOGS);
  assert.equal(r.status, 'done', r.error);
  assert.equal(steps.find((s) => s.id === 'osm')?.status, 'done');
  const places = res.places as Place[];
  assert.ok(places.length >= 6);
  assert.ok(places.every((p) => p.kind !== 'Dog park'));
});

test('Explore a place, whole: no interests, no model step for kinds and no question to OpenStreetMap; kinds it cannot name leave the answer as it was', async () => {
  routes = everything;
  asked.length = 0;
  questions.length = 0;
  const none = await run({ place: 'Research Triangle Park, NC', radius: 'The wider area (10 km)' });
  assert.equal(none.r.status, 'done', none.r.error);
  assert.equal(none.steps.find((s) => s.id === 'kinds')?.status, 'skipped');
  assert.equal(none.steps.find((s) => s.id === 'osm')?.status, 'skipped');
  assert.ok(!asked.some((x) => /overpass/.test(x.url.host)));
  assert.ok(!questions.some((q) => /Which kinds of place/.test(q)));
  assert.ok((none.res.places as Place[]).every((p) => p.kind !== 'Dog park'));
  // "History": no kind of place, so the model gives none and OpenStreetMap is not asked.
  kinds = { tags: [] };
  asked.length = 0;
  const hist = await run({ ...DOGS, interests: 'History' });
  assert.equal(hist.r.status, 'done', hist.r.error);
  assert.equal(hist.steps.find((s) => s.id === 'osm')?.status, 'skipped');
  assert.ok(!asked.some((x) => /overpass/.test(x.url.host)));
  kinds = { tags: TAGS };
});

test('LIVE Explore a place: the real services for Research Triangle Park and Dog parks', async () => {
  const { r, res } = await run(DOGS);
  assert.equal(r.status, 'done', r.error);
  for (const p of (res.places as Place[]).slice(0, 8)) console.log(`  ${p.kind}: ${p.name} · ${p.about} · ${p.km} km · ${p.link} · ${p.picture ?? 'no picture'}`);
});

// ---- run ---------------------------------------------------------------------------------------------------------

const only = LIVE ? tests.filter(([name]) => /^LIVE/.test(name)) : tests.filter(([name]) => !/^LIVE/.test(name));
for (const [name, fn] of only) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed} of ${only.length} passed`);
srv.close();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
