// Script tests for free photos: Openverse's and Commons' answers read as photos (licences and their credit, Flickr's and
// Wikimedia's smaller copies), the routes against a stand-in Openverse (a search, its small pictures, Use keeping the
// photo with its credit, Commons when Openverse answers 429 or finds none, a photo too large to keep coming at a slide's
// size), and find_photos saving photos and their credits into the session's folder. Nothing goes to the web unless
// LIVE_PHOTOS=1 (one real search, free).
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/photos/photos-test.ts
//   DATA_DIR=/tmp/hydor-test-photos node dist/dev/photos-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { getAsset, initAssets } from '../pages/assets.ts';
import { writePng } from '../signatures/png.ts';
import { photoCaption, photoCredit, type Photo, type PhotoSearch, type PhotoUse } from '../../shared/photos.ts';
import { photos } from './index.ts';
import { commonsAt, fromCommons, fromOpenverse, setPhotoDepsForTests, type PhotoDeps } from './search.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-photos-test-')));

// ---- recorded answers ---------------------------------------------------------------------------------------------

const png = (w: number, h: number, rgb: [number, number, number]) => {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
  return writePng({ width: w, height: h, data });
};

const OV = {
  result_count: 3,
  page_count: 4,
  page_size: 20,
  page: 1,
  results: [
    {
      id: 'f9812900-83f8-49a6-9d86-f2185f64e142',
      title: 'Dawn on a mountain lake — Morskie Oko, Poland',
      foreign_landing_url: 'https://www.flickr.com/photos/66885349@N03/37504444722',
      url: 'https://live.staticflickr.com/4459/37504444722_f8220066f5_b.jpg',
      creator: 'Gael Varoquaux',
      creator_url: 'https://www.flickr.com/photos/66885349@N03',
      license: 'by',
      license_version: '2.0',
      license_url: 'https://creativecommons.org/licenses/by/2.0/',
      provider: 'flickr',
      source: 'flickr',
      height: 683,
      width: 1024,
      thumbnail: 'https://api.openverse.org/v1/images/f9812900-83f8-49a6-9d86-f2185f64e142/thumb/',
      detail_url: 'https://api.openverse.org/v1/images/f9812900-83f8-49a6-9d86-f2185f64e142/',
    },
    {
      id: '13b0ec75-08a2-4b4a-865d-f2fe98a1c43d',
      title: 'Lake in the Alps',
      foreign_landing_url: 'https://commons.wikimedia.org/w/index.php?curid=1',
      url: 'https://upload.wikimedia.org/wikipedia/commons/5/5a/Lake_in_the_Alps.jpg',
      creator: 'A. Walker',
      license: 'cc0',
      license_version: '1.0',
      license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      provider: 'wikimedia',
      source: 'wikimedia',
      height: 4000,
      width: 6000,
      thumbnail: 'https://api.openverse.org/v1/images/13b0ec75-08a2-4b4a-865d-f2fe98a1c43d/thumb/',
    },
    // No licence the app knows: left out.
    { id: 'deadbeef-0000-4000-8000-000000000000', title: 'Odd', url: 'https://example.org/a.jpg', foreign_landing_url: 'https://example.org/a', license: 'all-rights-reserved' },
    // Not https: left out.
    { id: 'deadbeef-0000-4000-8000-000000000001', title: 'Plain', url: 'http://example.org/b.jpg', foreign_landing_url: 'https://example.org/b', license: 'by' },
  ],
};

const WM = {
  batchcomplete: true,
  continue: { gsroffset: 20 },
  query: {
    pages: [
      {
        pageid: 134682226,
        ns: 6,
        title: 'File:Mountains in snow, Mountain lake, Chola Valley, Nepal.jpg',
        index: 2,
        imageinfo: [
          {
            size: 7417279,
            width: 4032,
            height: 2688,
            thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Mountains_in_snow.jpg/330px-Mountains_in_snow.jpg',
            url: 'https://upload.wikimedia.org/wikipedia/commons/5/5a/Mountains_in_snow.jpg?utm_source=commons.wikimedia.org',
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Mountains_in_snow.jpg',
            mime: 'image/jpeg',
            extmetadata: {
              ObjectName: { value: 'Mountains in snow, Mountain lake, Chola Valley, Nepal' },
              Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Argenberg" title="User:Argenberg">Vyacheslav Argenberg</a>' },
              LicenseShortName: { value: 'CC BY 4.0' },
              AttributionRequired: { value: 'true' },
              LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0' },
            },
          },
        ],
      },
      {
        pageid: 99,
        ns: 6,
        title: 'File:Old_map.jpg',
        index: 1,
        imageinfo: [
          {
            width: 800,
            height: 900,
            url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Old_map.jpg',
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Old_map.jpg',
            mime: 'image/jpeg',
            extmetadata: { LicenseShortName: { value: 'Public domain' }, AttributionRequired: { value: 'false' } },
          },
        ],
      },
      // An audio file: no picture.
      {
        pageid: 7,
        ns: 6,
        title: 'File:Song.ogg',
        index: 3,
        imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/1/12/Song.ogg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Song.ogg', mime: 'audio/ogg', extmetadata: { LicenseShortName: { value: 'CC0' } } }],
      },
    ],
  },
};

// ---- reading answers ------------------------------------------------------------------------------------------------

{
  const a = fromOpenverse(OV.results[0] as Record<string, unknown>)!;
  ok(a.id === 'ov:f9812900-83f8-49a6-9d86-f2185f64e142' && a.license === 'CC BY 2.0' && a.attribution && a.from === 'Flickr', 'a Flickr photo under CC BY 2.0 asks for credit');
  ok(a.small === 'https://live.staticflickr.com/4459/37504444722_f8220066f5_w.jpg', 'its small picture is Flickr’s own 400-pixel copy (no Openverse thumbnail spent)');
  const b = fromOpenverse(OV.results[1] as Record<string, unknown>)!;
  ok(b.license === 'CC0 1.0' && !b.attribution && b.from === 'Wikimedia Commons', 'a CC0 photo asks for no credit');
  ok(b.big === 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Lake_in_the_Alps.jpg/1280px-Lake_in_the_Alps.jpg', 'a large Wikimedia original is kept at 1280 pixels across');
  ok(b.small.endsWith('/330px-Lake_in_the_Alps.jpg'), 'and shown small at 330');
  ok(fromOpenverse(OV.results[2] as Record<string, unknown>) === null && fromOpenverse(OV.results[3] as Record<string, unknown>) === null, 'an unknown licence or a plain http address is no photo');
  ok(commonsAt('https://upload.wikimedia.org/wikipedia/commons/a/ab/Scan.tif', 1280) === 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Scan.tif/1280px-Scan.tif.jpg', 'a TIFF’s copy is a JPEG');
  const c = fromCommons(WM.query.pages[0] as Record<string, unknown>)!;
  ok(c.id === 'wm:134682226' && c.creator === 'Vyacheslav Argenberg' && c.license === 'CC BY 4.0' && c.attribution, 'Commons: its author out of its HTML, its licence');
  ok(c.url === 'https://upload.wikimedia.org/wikipedia/commons/5/5a/Mountains_in_snow.jpg' && c.big?.includes('/1280px-'), 'Commons: the address without its tracking, and its 1280 copy');
  const d = fromCommons(WM.query.pages[1] as Record<string, unknown>)!;
  ok(d.title === 'Old map' && !d.attribution && !d.creator, 'Commons: a public domain file, named from its file');
  ok(fromCommons(WM.query.pages[2] as Record<string, unknown>) === null, 'Commons: a sound is no photo');
  const credit = photoCredit({ ...c, thumb: '' } as Photo);
  ok(
    credit === 'Photo: “Mountains in snow, Mountain lake, Chola Valley, Nepal” by Vyacheslav Argenberg, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0). From Wikimedia Commons: https://commons.wikimedia.org/wiki/File:Mountains_in_snow.jpg',
    `the credit names title, author, licence and page (${credit})`,
  );
  ok(photoCredit({ ...d, thumb: '' } as Photo).includes('Public domain, free to use without credit'), 'a public domain credit says it needs none');
  const cap = photoCaption({ ...c, thumb: '' } as Photo);
  ok(cap.map((r) => r.t).join('') === 'Photo: “Mountains in snow, Mountain lake, Chola Valley, Nepal” by Vyacheslav Argenberg, CC BY 4.0', 'the caption reads as one line');
  ok(cap[1].link === c.page && cap[cap.length - 1].link === 'https://creativecommons.org/licenses/by/4.0', 'its title links to its page, its licence to its text');
}

// ---- the routes, against a stand-in ---------------------------------------------------------------------------------

const asked: string[] = [];
let openverseDown = false;
let openverseEmpty = false;
const PIC = png(64, 40, [40, 120, 200]);
const SMALL = png(16, 10, [200, 120, 40]);
const stand: PhotoDeps = {
  async json(url) {
    asked.push(url);
    if (url.startsWith('https://api.openverse.org/')) {
      if (openverseDown) throw new Error('it has had too many searches from this computer for now');
      if (/\/v1\/images\/[0-9a-f-]+\/$/.test(url)) return OV.results.find((r) => url.includes(r.id)) ?? null;
      return openverseEmpty ? { result_count: 0, page_count: 0, results: [] } : OV;
    }
    if (url.startsWith('https://commons.wikimedia.org/')) return WM;
    throw new Error('not a search');
  },
  async picture(url, max) {
    asked.push(url);
    // The Wikimedia original is far too large; its copy is fine.
    if (url.includes('/5a/Lake_in_the_Alps.jpg') && !url.includes('/thumb/')) return null;
    if (url.includes('_w.jpg') || url.includes('/330px-')) return SMALL;
    return PIC.length <= max ? PIC : null;
  },
};
setPhotoDepsForTests(stand);

const db = openDb(path.join(tmp, 'test.db'));
initAssets(db);
const app = Fastify();
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
const deps = { app, db, broadcast() {}, toSubscribers() {}, publicBase: () => 'https://hydor.example' } as unknown as Deps;
photos.routes!(deps);
await app.ready();

{
  const r = await app.inject({ method: 'GET', url: '/api/photos/search?q=mountain%20lake&orientation=wide' });
  const s = r.json() as PhotoSearch;
  ok(r.statusCode === 200 && s.from === 'openverse' && s.photos.length === 2 && s.more, `a search: Openverse's photos (${r.statusCode} ${r.body.slice(0, 200)})`);
  const q = new URL(asked.find((u) => u.startsWith('https://api.openverse.org/v1/images/?'))!).searchParams;
  ok(q.get('q') === 'mountain lake' && q.get('aspect_ratio') === 'wide' && q.get('license_type') === 'commercial,modification' && q.get('mature') === 'false', 'Openverse is asked for wide photos free for any use and to change, nothing for adults');
  ok(
    s.photos.every((p) => p.thumb.startsWith('/api/photos/thumb/') && !JSON.stringify(p).includes('staticflickr')),
    'the editor sees no address of the photos’ pictures, only this server’s',
  );
  const t = await app.inject({ method: 'GET', url: s.photos[0].thumb });
  ok(t.statusCode === 200 && t.headers['content-type'] === 'image/png' && t.rawPayload.equals(SMALL) && String(t.headers['content-security-policy']).includes('sandbox'), 'its small picture comes through this server');
  const none = await app.inject({ method: 'GET', url: '/api/photos/thumb/ov%3Aunknown-id-1234' });
  ok(none.statusCode === 404, 'a photo it never found has no small picture');
  const u = await app.inject({ method: 'POST', url: '/api/photos/use', payload: { id: s.photos[0].id } });
  const used = u.json() as PhotoUse;
  ok(u.statusCode === 200 && /^naget-asset:[a-f0-9]{40}$/.test(used.src) && used.w === 64 && used.h === 40, `Use keeps the photo with its size (${u.body.slice(0, 160)})`);
  ok(!!getAsset(db, used.src.slice('naget-asset:'.length)), 'kept as the app keeps pictures');
  ok(used.credit.startsWith('Photo: “Dawn on a mountain lake') && used.credit.includes('CC BY 2.0') && used.photo.attribution, 'with its credit');
  asked.length = 0;
  const big = await app.inject({ method: 'POST', url: '/api/photos/use', payload: { id: s.photos[1].id } });
  ok(big.statusCode === 200 && asked[0]?.includes('/1280px-Lake_in_the_Alps.jpg'), 'a large original comes at a slide’s size');
  const bad = await app.inject({ method: 'POST', url: '/api/photos/use', payload: { id: 'nope' } });
  ok(bad.statusCode === 404 && /search again/.test(bad.json().error), 'an id no search gave is refused in words');
  const empty = await app.inject({ method: 'GET', url: '/api/photos/search?q=' });
  ok(empty.statusCode === 400, 'a search needs words');
}

{
  // Openverse out of searches: Commons answers, and its later pages are asked of it.
  openverseDown = true;
  const r = await app.inject({ method: 'GET', url: '/api/photos/search?q=mountain%20lake' });
  const s = r.json() as PhotoSearch;
  ok(r.statusCode === 200 && s.from === 'wikimedia' && s.photos.length === 2 && s.photos[0].id === 'wm:99', `Commons when Openverse cannot answer, in its order (${r.body.slice(0, 160)})`);
  asked.length = 0;
  await app.inject({ method: 'GET', url: '/api/photos/search?q=mountain%20lake&page=2&from=wikimedia' });
  ok(asked.length === 1 && asked[0].startsWith('https://commons.wikimedia.org/') && new URL(asked[0]).searchParams.get('gsroffset') === '20', 'its next page is Commons’ again');
  openverseDown = false;
  openverseEmpty = true;
  const e = (await app.inject({ method: 'GET', url: '/api/photos/search?q=zzqx' })).json() as PhotoSearch;
  ok(e.from === 'wikimedia', 'Commons too when Openverse finds none');
  openverseEmpty = false;
  // After a restart (nothing remembered), Use asks Openverse for the photo again by its id.
  const fresh = await app.inject({ method: 'POST', url: '/api/photos/use', payload: { id: 'ov:f9812900-83f8-49a6-9d86-f2185f64e142' } });
  ok(fresh.statusCode === 200, 'an id is enough');
}

// ---- find_photos ---------------------------------------------------------------------------------------------------

{
  const ctx = { runId: 'r1', key: 'claude:p1', agent: 'claude', cwd: tmp, deps } as RunCtx;
  const tool = photos.tools!(ctx).find((t) => t.name === 'find_photos')!;
  ok(!!tool && /free photos/i.test(tool.description) && /credit/i.test(tool.description), 'agents get find_photos, told to credit');
  const out = String(await tool.run({ query: 'Mountain lake at dawn', count: 2 }, ctx));
  const dir = path.join(tmp, 'images');
  const files = fs.readdirSync(dir).sort();
  ok(files.includes('mountain-lake-at-dawn-1.png') && files.includes('mountain-lake-at-dawn-2.png') && files.includes('mountain-lake-at-dawn-credits.md'), `the photos and their credits in images/ (${files.join(', ')})`);
  const credits = fs.readFileSync(path.join(dir, 'mountain-lake-at-dawn-credits.md'), 'utf8');
  ok(credits.includes('mountain-lake-at-dawn-1.png: Photo: “') && credits.includes('CC BY 2.0'), 'each file with its credit');
  ok(out.includes(path.join(dir, 'mountain-lake-at-dawn-1.png')) && /notes/.test(out) && /caption/.test(out), 'the answer says each path and how to credit it');
  const again = String(await tool.run({ query: 'Mountain lake at dawn', count: 1 }, ctx));
  ok(again.includes('mountain-lake-at-dawn-3.png') && fs.existsSync(path.join(dir, 'mountain-lake-at-dawn-credits-2.md')), 'a second call takes names of its own');
}

// ---- live (free) ------------------------------------------------------------------------------------------------

if (process.env.LIVE_PHOTOS === '1') {
  setPhotoDepsForTests(null);
  const r = await app.inject({ method: 'GET', url: '/api/photos/search?q=lighthouse' });
  const s = r.json() as PhotoSearch;
  console.log(`live: ${s.from}, ${s.photos.length} photos; first: ${s.photos[0] ? photoCredit(s.photos[0]) : '-'}`);
  ok(r.statusCode === 200 && s.photos.length > 0, 'a real search finds photos');
  if (s.photos[0]) {
    const t = await app.inject({ method: 'GET', url: s.photos[0].thumb });
    ok(t.statusCode === 200 && /^image\//.test(String(t.headers['content-type'])), 'its small picture');
    const u = await app.inject({ method: 'POST', url: '/api/photos/use', payload: { id: s.photos[0].id } });
    console.log(`live use: ${u.statusCode} ${u.body.slice(0, 200)}`);
    ok(u.statusCode === 200, 'and Use keeps it');
  }
}

await app.close();
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
