// Script tests for Chrome extensions (extensions.ts), without the network: a CRX3 and a CRX2 made here (unpacking keeps the
// extension's id and writes its key; a file for another id is refused), names in the extension's language, what the desktop
// app's browser lacks, folders and their ids, a fake Chrome profile pair under a temporary HOME, and the routes (install from the
// store with a stand-in for the download, import, switches, delete, icon) and what the rest of the app asks for.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/browser/extensions-test.ts
//   DATA_DIR=/tmp/hydor-test-extensions node dist/dev/extensions-test.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import Fastify from 'fastify';
import { HttpError } from '../auth.ts';
import { openDb, kvGet } from '../db.ts';
import type { Deps } from '../features/types.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-extensions-test-'));
const home = path.join(tmp, 'home');
fs.mkdirSync(home, { recursive: true });
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.LOCALAPPDATA = path.join(home, 'AppData/Local');
process.env.APPDATA = path.join(home, 'AppData/Roaming');
delete process.env.XDG_CONFIG_HOME;

const ex = await import('./extensions.ts');
const db = openDb(path.join(tmp, 'test.db'));

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// ---- helpers: a zip, a protobuf and a CRX --------------------------------------------------------------------

/** A zip of stored (uncompressed) files, written by hand; the second one is deflated, to cover both. */
function makeZip(files: Record<string, string | Buffer>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  let n = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    const deflate = n++ % 2 === 1;
    const packed = deflate ? zlib.deflateRawSync(data) : data;
    const nm = Buffer.from(name);
    const crc = zlib.crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(packed.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nm.length, 26);
    parts.push(lh, nm, packed);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(deflate ? 8 : 0, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(packed.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nm.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nm);
    offset += 30 + nm.length + packed.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const varint = (n: number) => {
  const out: number[] = [];
  while (n >= 128) {
    out.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return Buffer.from(out);
};
/** A length-delimited protobuf field. */
const field = (no: number, bytes: Buffer) => Buffer.concat([varint(no * 8 + 2), varint(bytes.length), bytes]);

const newKey = () => crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
const idOf = (der: Buffer) => ex.idFromKey(der);

function crx3(zip: Buffer, key: Buffer, decoy = newKey(), claimed = key): Buffer {
  const proof = (k: Buffer) => Buffer.concat([field(1, k), field(2, crypto.randomBytes(64))]);
  const crxId = crypto.createHash('sha256').update(claimed).digest().subarray(0, 16);
  const header = Buffer.concat([field(2, proof(decoy)), field(2, proof(key)), field(3, proof(newKey())), field(10000, field(1, crxId))]);
  const head = Buffer.alloc(12);
  head.write('Cr24', 0, 'latin1');
  head.writeUInt32LE(3, 4);
  head.writeUInt32LE(header.length, 8);
  return Buffer.concat([head, header, zip]);
}
function crx2(zip: Buffer, key: Buffer): Buffer {
  const sig = crypto.randomBytes(128);
  const head = Buffer.alloc(16);
  head.write('Cr24', 0, 'latin1');
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(key.length, 8);
  head.writeUInt32LE(sig.length, 12);
  return Buffer.concat([head, key, sig, zip]);
}

const manifest = (over: Record<string, unknown> = {}) => ({ manifest_version: 3, name: 'Sample', version: '1.2.3', ...over });
const write = (file: string, content: string | Buffer | object) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content));
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

const app = Fastify();
app.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
ex.extensionRoutes({ app, db } as unknown as Deps);
const call = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => {
  const r = await app.inject({ method, url, payload: payload as any });
  return { status: r.statusCode, json: r.headers['content-type']?.toString().includes('json') ? r.json() : null, raw: r.rawPayload, type: String(r.headers['content-type'] ?? '') };
};

let changes = 0;
ex.onExtensionsChange(() => changes++);

// ---- tests ---------------------------------------------------------------------------------------------------

const key1 = newKey();
const id1 = idOf(key1);

test('ids: letters a to p, from a key and from a folder path', () => {
  assert.match(id1, /^[a-p]{32}$/);
  assert.equal(ex.idFromKey(key1.toString('base64')), id1);
  assert.match(ex.idFromFolder('/tmp/some folder'), /^[a-p]{32}$/);
  assert.equal(ex.idFromFolder('/tmp/a'), ex.idFromFolder('/tmp/a/'));
  assert.notEqual(ex.idFromFolder('/tmp/a'), ex.idFromFolder('/tmp/b'));
  // Chromium's id for the Web Store app's key, as a check on the letters: the first byte 0xab is "kl".
  assert.equal(ex.idFromKey(Buffer.alloc(16)).length, 32);
});

test('store addresses and ids', () => {
  assert.equal(ex.storeId(id1), id1);
  assert.equal(ex.storeId(`https://chromewebstore.google.com/detail/dark-reader/${id1}`), id1);
  assert.equal(ex.storeId(`https://chromewebstore.google.com/detail/${id1}?hl=en`), id1);
  assert.equal(ex.storeId(`https://chrome.google.com/webstore/detail/dark-reader/${id1}/reviews`), id1);
  assert.equal(ex.storeId('https://example.com/detail/' + id1), null);
  assert.equal(ex.storeId('not an id'), null);
  assert.equal(ex.storeId('abcdefghijklmnopqrstuvwxyzabcdef'), null);
  assert.match(ex.crxUrl(id1), /^https:\/\/clients2\.google\.com\/service\/update2\/crx\?response=redirect&prodversion=\d+\.0\.0\.0&acceptformat=crx2,crx3&x=id%3D[a-p]{32}%26uc$/);
});

test('a CRX3 unpacks with its own id kept: the key is written into the manifest', async () => {
  const zip = makeZip({
    'manifest.json': JSON.stringify(manifest({ name: '__MSG_appName__', description: '__MSG_appDesc__', default_locale: 'en', icons: { '16': 'i16.png', '48': 'i48.png', '128': 'i128.png', '512': 'i512.png' } })),
    '_locales/en/messages.json': JSON.stringify({ appName: { message: 'Sample extension' }, APPDESC: { message: 'Does things' } }),
    'i16.png': PNG,
    'i48.png': PNG,
    'i128.png': PNG,
    'i512.png': PNG,
  });
  const file = path.join(tmp, 'a.crx');
  fs.writeFileSync(file, crx3(zip, key1));
  const before = changes;
  const e = await ex.installCrxFile(db, file, id1);
  assert.equal(e.id, id1);
  assert.equal(e.name, 'Sample extension');
  assert.equal(e.description, 'Does things');
  assert.equal(e.version, '1.2.3');
  assert.equal(e.source, 'store');
  assert.equal(e.icon, true);
  assert.equal(e.enabled, true);
  assert.equal(e.agents, false);
  const [one] = ex.extensionsFor(db, 'browsing');
  assert.equal(one.id, id1);
  assert.equal(one.path, path.join(ex.EXTENSIONS_DIR, id1, '1.2.3'));
  const m = JSON.parse(fs.readFileSync(path.join(one.path, 'manifest.json'), 'utf8'));
  assert.equal(m.key, key1.toString('base64'));
  assert.equal(idOf(Buffer.from(m.key, 'base64')), id1);
  assert.equal(changes, before + 1);
  assert.deepEqual(fs.readdirSync(path.join(ex.EXTENSIONS_DIR, id1)), ['1.2.3']);
  assert.ok(!fs.existsSync(path.join(one.path, '.crx.zip')));
  await call('DELETE', `/api/browser/extensions/${id1}`);
  assert.ok(!fs.existsSync(path.join(ex.EXTENSIONS_DIR, id1)));
});

test('a CRX for another id, a damaged one and a non-CRX are refused', async () => {
  const zip = makeZip({ 'manifest.json': JSON.stringify(manifest()) });
  const file = path.join(tmp, 'b.crx');
  fs.writeFileSync(file, crx3(zip, newKey()));
  await assert.rejects(ex.installCrxFile(db, file, id1), /different extension/);
  fs.writeFileSync(file, 'PK not a crx at all, just some text that is long enough');
  await assert.rejects(ex.installCrxFile(db, file, id1), /not a Chrome extension file/);
  // The header says an id no key of it has.
  const k = newKey();
  fs.writeFileSync(file, crx3(zip, k, newKey(), newKey()));
  await assert.rejects(ex.installCrxFile(db, file, idOf(k)), /does not match its key/);
  await assert.rejects(ex.installCrxFile(db, file, 'nope'), /32 letters/);
});

test('a CRX2 works too, and a newer version replaces the older one but keeps the switches', async () => {
  const k = newKey();
  const id = idOf(k);
  const file = path.join(tmp, 'c.crx');
  fs.writeFileSync(file, crx2(makeZip({ 'manifest.json': JSON.stringify(manifest({ manifest_version: 2, version: '1.0' })) }), k));
  const a = await ex.installCrxFile(db, file, id);
  assert.equal(a.manifestVersion, 2);
  await call('PATCH', `/api/browser/extensions/${id}`, { enabled: false, agents: true });
  fs.writeFileSync(file, crx3(makeZip({ 'manifest.json': JSON.stringify(manifest({ version: '2.0' })) }), k));
  const b = await ex.installCrxFile(db, file, id);
  assert.equal(b.version, '2.0');
  assert.equal(b.enabled, false);
  assert.equal(b.agents, true);
  assert.deepEqual(fs.readdirSync(path.join(ex.EXTENSIONS_DIR, id)), ['2.0']);
  assert.equal((await call('GET', '/api/browser/extensions')).json.extensions.filter((x: any) => x.id === id).length, 1);
  await call('DELETE', `/api/browser/extensions/${id}`);
  assert.ok(!fs.existsSync(path.join(ex.EXTENSIONS_DIR, id)));
});

test('names, descriptions and titles in the extension’s language; a missing message stays as written', () => {
  const dir = path.join(tmp, 'locales');
  write(path.join(dir, 'manifest.json'), '﻿' + JSON.stringify(manifest({ name: '__MSG_Name__', description: '__MSG_nothing__', default_locale: 'de', action: { default_title: '__MSG_tip__' } })));
  write(path.join(dir, '_locales/de/messages.json'), { name: { message: 'Mein Werkzeug' }, TIP: { message: 'Klick mich' } });
  write(path.join(dir, '_locales/en/messages.json'), { name: { message: 'My tool' } });
  const d = ex.describe(dir);
  assert.equal(d.name, 'Mein Werkzeug');
  assert.equal(d.action?.title, 'Klick mich');
  assert.equal(d.description, '__MSG_nothing__');
  // No default locale given: English.
  write(path.join(dir, 'manifest.json'), manifest({ name: '__MSG_name__' }));
  assert.equal(ex.describe(dir).name, 'My tool');
  // en_US when only that exists.
  fs.rmSync(path.join(dir, '_locales/en'), { recursive: true });
  fs.rmSync(path.join(dir, '_locales/de'), { recursive: true });
  write(path.join(dir, '_locales/en_US/messages.json'), { name: { message: 'My US tool' } });
  assert.equal(ex.describe(dir).name, 'My US tool');
});

test('the toolbar button, icon and options page, for MV3 and MV2', () => {
  const dir = path.join(tmp, 'toolbar');
  write(path.join(dir, 'manifest.json'), manifest({ action: { default_title: 'Go', default_popup: '/popup.html', default_icon: { '19': 'a19.png', '38': 'a38.png' } }, options_ui: { page: 'options.html' } }));
  write(path.join(dir, 'a38.png'), PNG);
  let d = ex.describe(dir);
  assert.deepEqual(d.action, { title: 'Go', popup: 'popup.html' });
  assert.equal(d.iconFile, path.join(dir, 'a38.png'));
  assert.equal(d.options, 'options.html');
  assert.equal(d.manifestVersion, 3);
  write(path.join(dir, 'manifest.json'), manifest({ manifest_version: 2, browser_action: { default_icon: 'a38.png' }, options_page: 'o.html', icons: { '16': 'gone.png', '256': 'big.png' } }));
  write(path.join(dir, 'big.png'), PNG);
  d = ex.describe(dir);
  assert.deepEqual(d.action, {});
  // The extension's own icons come first, but a file that is not there is passed over.
  assert.equal(d.iconFile, path.join(dir, 'big.png'));
  assert.equal(d.options, 'o.html');
  // A path out of the folder is not an icon.
  write(path.join(dir, 'manifest.json'), manifest({ icons: { '16': '../../etc/passwd' } }));
  assert.equal(ex.describe(dir).iconFile, undefined);
  assert.throws(() => ex.describe(path.join(tmp, 'nothing-here')), /manifest\.json/);
  write(path.join(dir, 'manifest.json'), '{ not json');
  assert.throws(() => ex.describe(dir), /not valid/);
  write(path.join(dir, 'manifest.json'), { manifest_version: 3 });
  assert.throws(() => ex.describe(dir), /name or version/);
});

test('unsupported: what the desktop app’s browser lacks, from permissions and optional ones', () => {
  const m = manifest({
    permissions: ['storage', 'tabs', 'scripting', 'declarativeNetRequest', 'cookies', 'identity', 'contextMenus', 'alarms', 'system.cpu', 'activeTab', 'sidePanel', 7],
    optional_permissions: ['history', 'notifications', 'enterprise.deviceAttributes'],
    host_permissions: ['https://*/*'],
  });
  assert.deepEqual(ex.unsupportedPermissions(m), ['cookies', 'declarativeNetRequest', 'enterprise.deviceAttributes', 'history', 'identity', 'sidePanel', 'system.cpu']);
  assert.deepEqual(ex.unsupportedPermissions(manifest({ permissions: ['storage', 'geolocation', 'webRequest', 'management'] })), []);
});

test('a folder: loaded in place with its key’s id, else the id of its path; replaced when loaded again', async () => {
  const dir = path.join(tmp, 'dev ext');
  write(path.join(dir, 'manifest.json'), manifest({ name: 'Dev', permissions: ['bookmarks'] }));
  const a = (await call('POST', '/api/browser/extensions/folder', { path: dir })).json;
  assert.equal(a.extension.id, ex.idFromFolder(fs.realpathSync(dir)));
  assert.equal(a.extension.source, 'folder');
  assert.equal(a.extension.from, fs.realpathSync(dir));
  assert.deepEqual(a.extension.unsupported, ['bookmarks']);
  assert.ok(!('dir' in a.extension));
  assert.equal(ex.extensionsFor(db, 'browsing').find((x) => x.id === a.extension.id)?.path, fs.realpathSync(dir));
  // The developer changes it: the list shows the new manifest.
  write(path.join(dir, 'manifest.json'), manifest({ name: 'Dev 2', version: '9.0' }));
  const listed = (await call('GET', '/api/browser/extensions')).json.extensions.find((x: any) => x.id === a.extension.id);
  assert.equal(listed.name, 'Dev 2');
  assert.equal(listed.version, '9.0');
  // With a key.
  const kdir = path.join(tmp, 'keyed');
  write(path.join(kdir, 'manifest.json'), manifest({ name: 'Keyed', key: key1.toString('base64') + '\n' }));
  const k = (await call('POST', '/api/browser/extensions/folder', { path: path.join(kdir, 'manifest.json') })).json;
  assert.equal(k.extension.id, id1);
  // Deleting a folder's extension leaves its files.
  assert.equal((await call('DELETE', `/api/browser/extensions/${id1}`)).status, 200);
  assert.ok(fs.existsSync(path.join(kdir, 'manifest.json')));
  assert.equal((await call('DELETE', `/api/browser/extensions/${a.extension.id}`)).status, 200);
  assert.ok(fs.existsSync(path.join(dir, 'manifest.json')));
  assert.equal((await call('POST', '/api/browser/extensions/folder', { path: path.join(tmp, 'missing') })).status, 400);
  assert.equal((await call('POST', '/api/browser/extensions/folder', { path: '' })).status, 400);
  assert.equal((await call('POST', '/api/browser/extensions/folder', { path: os.tmpdir() })).status, 400);
});

// A fake Chrome with two profiles: Default (one on, one off, a built-in and an unpacked app) and Profile 1 (one).
const chrome = path.join(home, '.config/google-chrome');
const eOn = 'a'.repeat(32);
const eOff = 'b'.repeat(32);
const eNew = 'c'.repeat(32);
const eComp = 'd'.repeat(32);
const eApp = 'e'.repeat(32);
function fakeChrome() {
  write(path.join(chrome, 'Local State'), { profile: { info_cache: { Default: { name: 'Person 1' }, 'Profile 1': { name: 'Work' } } } });
  const ext = (profile: string, id: string, version: string, extra: Record<string, unknown> = {}) => {
    write(path.join(chrome, profile, 'Extensions', id, version, 'manifest.json'), manifest({ name: `Ext ${id[0]}`, version: version.replace(/_\d+$/, ''), ...extra }));
  };
  ext('Default', eOn, '1.0_0');
  ext('Default', eOn, '1.10_0');
  ext('Default', eOn, '1.9_0');
  write(path.join(chrome, 'Default/Extensions', eOn, '1.10_0/icon.png'), PNG);
  ext('Default', eOff, '3.0_0', { name: 'Switched off' });
  ext('Default', eComp, '1.0_0');
  ext('Default', 'ahfgeienlihckogmohjhadlkjgocpleb', '1.0_0');
  ext('Default', eApp, '1.0_0', { app: { launch: { web_url: 'https://x.example' } } });
  ext('Profile 1', eNew, '0.5_0', { name: 'In work' });
  write(path.join(chrome, 'Default/Preferences'), {
    extensions: { settings: { [eOn]: { state: 1, location: 1 }, [eOff]: { state: 0, location: 1 }, [eComp]: { state: 1, location: 5 } } },
  });
  write(path.join(chrome, 'Default/Secure Preferences'), { extensions: { settings: { [eApp]: { state: 1, location: 1 } } } });
  write(path.join(chrome, 'Profile 1/Secure Preferences'), { extensions: { settings: { [eNew]: { location: 1, disable_reasons: [] } } } });
}

test('another browser: its profiles’ extensions (newest version, on or off, no built-ins), and bringing them in', async () => {
  fakeChrome();
  const s = (await call('GET', '/api/browser/extensions')).json.sources as any[];
  assert.deepEqual(
    s.map((x) => x.extensionId).sort(),
    [eNew, eOff, eOn].sort(),
  );
  const on = s.find((x) => x.extensionId === eOn);
  assert.equal(on.browser, 'Google Chrome');
  assert.equal(on.profile, 'Person 1');
  assert.equal(on.version, '1.10');
  assert.equal(on.enabled, true);
  assert.equal(on.have, false);
  assert.equal(on.id, `chrome:Default/${eOn}`);
  assert.equal(s.find((x) => x.extensionId === eOff).enabled, false);
  assert.equal(s.find((x) => x.extensionId === eNew).profile, 'Work');
  assert.equal(s.find((x) => x.extensionId === eNew).enabled, true);

  const r = await call('POST', '/api/browser/extensions/import', { ids: [on.id, `chrome:Default/${eOff}`, 'chrome:Default/zzz'] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.added.map((x: any) => x.id).sort(), [eOff, eOn].sort());
  assert.equal(r.json.failed.length, 1);
  const got = r.json.extensions.find((x: any) => x.id === eOn);
  assert.equal(got.source, 'import');
  assert.equal(got.from, 'Google Chrome');
  assert.equal(got.version, '1.10');
  assert.equal(got.enabled, true);
  assert.ok(fs.existsSync(path.join(ex.EXTENSIONS_DIR, eOn, '1.10', 'icon.png')));
  assert.ok(fs.existsSync(path.join(ex.EXTENSIONS_DIR, eOn, '1.10', 'manifest.json')));
  assert.equal(r.json.sources.find((x: any) => x.extensionId === eOn).have, true);
  assert.equal(r.json.sources.find((x: any) => x.extensionId === eNew).have, false);
  assert.equal((await call('POST', '/api/browser/extensions/import', { ids: ['chrome:Default/zzz'] })).status, 400);
  assert.equal((await call('POST', '/api/browser/extensions/import', { ids: [] })).status, 400);
});

test('switches, extensionsFor and the change listeners', async () => {
  const before = changes;
  let r = await call('PATCH', `/api/browser/extensions/${eOn}`, { agents: true });
  assert.equal(r.json.extension.agents, true);
  assert.equal(r.json.extension.enabled, true);
  assert.equal(changes, before + 1);
  assert.deepEqual(ex.extensionsFor(db, 'browsing').map((x) => x.id).sort(), [eOff, eOn].sort());
  assert.deepEqual(ex.extensionsFor(db, 'agents').map((x) => x.id), [eOn]);
  await call('PATCH', `/api/browser/extensions/${eOn}`, { enabled: false });
  assert.deepEqual(ex.extensionsFor(db, 'agents'), []);
  assert.deepEqual(ex.extensionsFor(db, 'browsing').map((x) => x.id), [eOff]);
  assert.equal((await call('PATCH', '/api/browser/extensions/nope', { enabled: true })).status, 404);
  assert.equal((await call('PATCH', `/api/browser/extensions/${'f'.repeat(32)}`, { enabled: true })).status, 404);
  // Stored in the key-value store, with the folder kept for each.
  const stored = JSON.parse(kvGet(db, 'browser.extensions') ?? '[]');
  assert.ok(stored.every((x: any) => typeof x.dir === 'string' && typeof x.id === 'string'));
  // The listener that is taken off hears no more.
  let heard = 0;
  const off = ex.onExtensionsChange(() => heard++);
  await call('PATCH', `/api/browser/extensions/${eOn}`, { enabled: true });
  off();
  await call('PATCH', `/api/browser/extensions/${eOn}`, { enabled: false });
  assert.equal(heard, 1);
  r = await call('GET', '/api/browser/extensions');
  assert.equal(r.json.runs, false);
});

test('the icon: the file with its content type; none for an extension without one', async () => {
  const r = await call('GET', `/api/browser/extensions/${eOn}/icon`);
  assert.equal(r.status, 404, 'its manifest names no icon');
  const dir = path.join(tmp, 'svgext');
  write(path.join(dir, 'manifest.json'), manifest({ name: 'Svg', icons: { '48': 'i.svg' } }));
  write(path.join(dir, 'i.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const id = (await call('POST', '/api/browser/extensions/folder', { path: dir })).json.extension.id;
  const svg = await call('GET', `/api/browser/extensions/${id}/icon`);
  assert.equal(svg.status, 200);
  assert.match(svg.type, /^image\/svg\+xml/);
  assert.match(svg.raw.toString(), /<svg/);
  write(path.join(dir, 'manifest.json'), manifest({ name: 'Svg', icons: { '48': 'i.png' } }));
  write(path.join(dir, 'i.png'), PNG);
  assert.match((await call('GET', `/api/browser/extensions/${id}/icon`)).type, /^image\/png/);
  assert.equal((await call('GET', `/api/browser/extensions/${id}/icon`)).raw.length, PNG.length);
  await call('DELETE', `/api/browser/extensions/${id}`);
});

test('the store route: downloads (a stand-in here), installs, and says plainly what went wrong', async () => {
  const k = newKey();
  const id = idOf(k);
  const crx = crx3(makeZip({ 'manifest.json': JSON.stringify(manifest({ name: 'From the store' })) }), k);
  const real = globalThis.fetch;
  const asked: string[] = [];
  let reply: () => Response = () => new Response(new Uint8Array(crx), { status: 200, headers: { 'content-type': 'application/x-chrome-extension' } });
  globalThis.fetch = (async (url: string) => {
    asked.push(String(url));
    return reply();
  }) as typeof fetch;
  try {
    const r = await call('POST', '/api/browser/extensions/store', { url: `https://chromewebstore.google.com/detail/from-the-store/${id}` });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.extension.id, id);
    assert.equal(r.json.extension.name, 'From the store');
    assert.match(asked[0], new RegExp(`x=id%3D${id}%26uc$`));
    assert.equal(JSON.parse(fs.readFileSync(path.join(ex.EXTENSIONS_DIR, id, '1.2.3/manifest.json'), 'utf8')).key, k.toString('base64'));
    // Another extension's file under this id is refused.
    reply = () => new Response(new Uint8Array(crx3(makeZip({ 'manifest.json': JSON.stringify(manifest()) }), newKey())));
    assert.match((await call('POST', '/api/browser/extensions/store', { id })).json.error, /different extension|does not match/);
    reply = () => new Response('<html>no</html>', { status: 200 });
    assert.match((await call('POST', '/api/browser/extensions/store', { id })).json.error, /not a Chrome extension file/);
    reply = () => new Response(null, { status: 204 });
    assert.equal((await call('POST', '/api/browser/extensions/store', { id })).status, 404);
    reply = () => new Response('oops', { status: 500 });
    assert.equal((await call('POST', '/api/browser/extensions/store', { id })).status, 502);
    globalThis.fetch = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    assert.match((await call('POST', '/api/browser/extensions/store', { id })).json.error, /Could not reach/);
    assert.equal((await call('POST', '/api/browser/extensions/store', { id: 'hello' })).status, 400);
    assert.equal(fs.readdirSync(ex.EXTENSIONS_DIR).filter((n) => n.startsWith('.download')).length, 0);
  } finally {
    globalThis.fetch = real;
  }
  assert.equal((await call('DELETE', `/api/browser/extensions/${id}`)).status, 200);
  assert.equal((await call('DELETE', `/api/browser/extensions/${id}`)).status, 404);
});

test('removing: the copied files go, and the registry forgets it', async () => {
  for (const id of [eOn, eOff]) {
    assert.equal((await call('DELETE', `/api/browser/extensions/${id}`)).status, 200);
    assert.ok(!fs.existsSync(path.join(ex.EXTENSIONS_DIR, id)));
  }
  assert.deepEqual((await call('GET', '/api/browser/extensions')).json.extensions, []);
  assert.deepEqual(ex.extensionsFor(db, 'browsing'), []);
  // What was copied from Chrome is untouched.
  assert.ok(fs.existsSync(path.join(chrome, 'Default/Extensions', eOn, '1.10_0/manifest.json')));
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
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);
