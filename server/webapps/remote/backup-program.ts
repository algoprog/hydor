// The program that makes, lists, checks and restores backups on a server, in the backup service of a launched app's compose
// project (Node's built-in modules and the image's `sqlite3` only). A backup is two files in /backups: <id>.tar.gz and
// <id>.json (the manifest, with the archive's size and SHA-256), in the format server/webapps/backups.ts writes inside
// Hydor. An app whose hydor.json names a SQLite file is copied while it runs (SQLite's online backup); any other app is
// stopped by whoever calls this while its data folder is copied. It also tells whether the data changed across a switch of
// versions, and asks the app whether it is ready.
// No backtick and no "${" in this text: it is a string of this module, written without template literals on purpose.
export const BACKUP_PROGRAM = String.raw`#!/usr/bin/env node
// hydor-backup now|list|verify <id>|restore <id>|mark|revert|fingerprint|prune|daemon|probe|listening
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { chmodSync, closeSync, cpSync, createReadStream, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readlinkSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = process.env.HYDOR_DATA_DIR || '/data';
const OUT = process.env.HYDOR_BACKUP_DIR || '/backups';
const KEEP_DAYS = Number(process.env.HYDOR_BACKUP_KEEP_DAYS || 14);
const AT = process.env.HYDOR_BACKUP_AT || '03:30';
const DB_NAME = process.env.HYDOR_DB_FILE || '';
const SQLITE = process.env.HYDOR_DB_SQLITE === '1' && !!DB_NAME;
const DB = SQLITE ? join(DATA, DB_NAME) : '';
const MARK = join(OUT, '.mark');
const ID = /^\d{8}-\d{6}(-[a-z0-9-]+)?$/;

const say = (level, msg, extra) => console.error(JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }));
const sqlite = (file, sql, json) => execFileSync('sqlite3', [...(json ? ['-json'] : []), '-cmd', '.timeout 15000', file, sql], { encoding: 'utf8', maxBuffer: 1 << 30 });
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-');
const first = (text) => String(text).split('\n')[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sha256(file) {
  const hash = createHash('sha256');
  const buffer = Buffer.alloc(1 << 20);
  const fd = openSync(file, 'r');
  try {
    for (;;) {
      const n = readSync(fd, buffer, 0, buffer.length, null);
      if (!n) return hash.digest('hex');
      hash.update(buffer.subarray(0, n));
    }
  } finally {
    closeSync(fd);
  }
}

/** The rows in each table of a database file, by table. */
function counts(file) {
  const names = JSON.parse(sqlite(file, "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name", true) || '[]').map((r) => r.name);
  const out = {};
  for (const name of names) out[name] = JSON.parse(sqlite(file, 'select count(*) as n from "' + name.replaceAll('"', '""') + '"', true))[0].n;
  return out;
}

const sideFiles = () => new Set(SQLITE ? [DB_NAME, DB_NAME + '-wal', DB_NAME + '-shm', DB_NAME + '-journal'] : []);

/** What is in the data folder besides the database SQLite itself copies. */
function entriesOf(dir) {
  const side = sideFiles();
  return existsSync(dir) ? readdirSync(dir).filter((n) => !side.has(n) && n !== 'lost+found').sort() : [];
}

/** Every file below a path, as paths relative to the data folder; a link is itself, never followed. */
function filesUnder(root, rel, out) {
  const s = lstatSync(join(root, rel));
  if (!s.isDirectory()) {
    out.push({ rel, bytes: s.size, link: s.isSymbolicLink(), plain: s.isFile() });
    return out;
  }
  for (const n of readdirSync(join(root, rel)).sort()) filesUnder(root, rel + '/' + n, out);
  return out;
}

const hashOf = (root, f) => (f.link ? 'link:' + readlinkSync(join(root, f.rel)) : f.plain ? sha256(join(root, f.rel)) : 'special');

/** The database's shape, and everything it holds (or, with no SQLite file, everything in the folder): as two hashes. */
function fingerprint() {
  const data = createHash('sha256');
  let schema = '-';
  if (SQLITE) {
    if (!existsSync(DB)) return { schema: 'none', data: 'none' };
    const version = sqlite(DB, 'pragma user_version').trim();
    schema = createHash('sha256').update(version + '\n' + sqlite(DB, "select type, name, tbl_name, sql from sqlite_master order by type, name")).digest('hex');
    // Through a file, so that a large database is not held in memory.
    const folder = mkdtempSync(join(tmpdir(), 'hydor-dump-'));
    try {
      execFileSync('sqlite3', ['-cmd', '.timeout 15000', DB], { input: '.output ' + join(folder, 'dump.sql') + '\n.dump\n' });
      data.update(version + '\n' + sha256(join(folder, 'dump.sql')));
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  } else {
    for (const e of entriesOf(DATA)) for (const f of filesUnder(DATA, e, [])) data.update(f.rel + '\0' + hashOf(DATA, f) + '\n');
  }
  return { schema, data: data.digest('hex') };
}

const s3Configured = () => !!(process.env.BACKUP_S3_BUCKET && process.env.BACKUP_S3_ACCESS_KEY_ID && process.env.BACKUP_S3_SECRET_ACCESS_KEY);
const hmac = (key, text) => createHmac('sha256', key).update(text).digest();

/** PUT a file to S3-compatible storage with a signature (AWS Signature Version 4, path-style: works with S3, MinIO, R2, Backblaze...). */
function s3put(file, key, type) {
  const endpoint = new URL(process.env.BACKUP_S3_ENDPOINT || 'https://s3.amazonaws.com');
  const bucket = process.env.BACKUP_S3_BUCKET;
  const region = process.env.BACKUP_S3_REGION || 'us-east-1';
  const prefix = (process.env.BACKUP_S3_PREFIX || '').replace(/^\/+|\/+$/g, '');
  const objectKey = (prefix ? prefix + '/' : '') + key;
  const path = '/' + [bucket, ...objectKey.split('/')].map(encodeURIComponent).join('/');
  const size = statSync(file).size;
  const payload = sha256(file);
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const day = amzDate.slice(0, 8);
  const headers = { host: endpoint.host, 'content-length': String(size), 'content-type': type, 'x-amz-content-sha256': payload, 'x-amz-date': amzDate };
  const signed = Object.keys(headers).filter((h) => h !== 'content-length').sort();
  const canonical = ['PUT', path, '', ...signed.map((h) => h + ':' + headers[h]), '', signed.join(';'), payload].join('\n');
  const scope = day + '/' + region + '/s3/aws4_request';
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonical).digest('hex')].join('\n');
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + process.env.BACKUP_S3_SECRET_ACCESS_KEY, day), region), 's3'), 'aws4_request');
  headers.authorization = 'AWS4-HMAC-SHA256 Credential=' + process.env.BACKUP_S3_ACCESS_KEY_ID + '/' + scope + ', SignedHeaders=' + signed.join(';') + ', Signature=' + createHmac('sha256', signingKey).update(toSign).digest('hex');
  const send = endpoint.protocol === 'http:' ? httpRequest : httpsRequest;
  return new Promise((resolve, reject) => {
    const req = send({ method: 'PUT', hostname: endpoint.hostname, port: endpoint.port || undefined, path, headers }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => (res.statusCode >= 200 && res.statusCode < 300 ? resolve({ key: objectKey }) : reject(new Error('the storage answered ' + res.statusCode + ': ' + body.slice(0, 200).replace(/\s+/g, ' ')))));
    });
    req.on('error', reject);
    createReadStream(file).pipe(req);
  });
}

/** One of these at a time: a scheduled backup must not copy a data folder a restore is half way through. */
async function locked(work) {
  mkdirSync(OUT, { recursive: true });
  const lock = join(OUT, '.lock');
  const start = Date.now();
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > 30 * 60000) rmSync(lock, { recursive: true, force: true });
      } catch {
        // gone meanwhile
      }
      if (Date.now() - start > 10 * 60000) throw new Error('another backup or restore is still going');
      await sleep(500);
    }
  }
  try {
    return await work();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

async function now(label) {
  mkdirSync(OUT, { recursive: true });
  const stopped = process.env.HYDOR_STOPPED === '1';
  if (!SQLITE && !stopped) throw new Error('this app names no SQLite database, so it has to be stopped while its folder is copied');
  const stage = mkdtempSync(join(tmpdir(), 'hydor-backup-'));
  try {
    const manifest = { format: 1, createdAt: new Date().toISOString(), launch: process.env.HYDOR_LAUNCH_ID || null, label: label || null, database: null, tables: {}, entries: [], files: 0, dataBytes: 0, ...(stopped ? { stopped: true } : {}) };
    const include = ['manifest.json'];
    if (SQLITE && existsSync(DB)) {
      const copy = join(stage, DB_NAME);
      sqlite(DB, ".backup '" + copy + "'");
      const check = sqlite(copy, 'pragma integrity_check').trim();
      if (check !== 'ok') throw new Error('the copy of the database did not pass its own check (' + first(check) + ')');
      manifest.tables = counts(copy);
      manifest.database = { file: DB_NAME, bytes: statSync(copy).size, sha256: sha256(copy) };
      include.push(DB_NAME);
    }
    manifest.entries = entriesOf(DATA);
    const listed = [];
    for (const e of manifest.entries) filesUnder(DATA, e, listed);
    manifest.files = listed.length;
    manifest.dataBytes = listed.reduce((n, f) => n + f.bytes, 0);
    // With the app stopped nothing moves, so every file can be held to its bytes when it is read back.
    if (stopped) manifest.hashes = Object.fromEntries(listed.map((f) => [f.rel, hashOf(DATA, f)]));
    writeFileSync(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));
    let id = stamp(new Date()) + (label ? '-' + label : '');
    for (let n = 2; existsSync(join(OUT, id + '.json')); n++) id = stamp(new Date()) + (label ? '-' + label : '') + '-' + n; // two in one second
    const archive = join(OUT, id + '.tar.gz');
    const partial = archive + '.partial';
    const tar = spawnSync('tar', ['-czf', partial, '-C', stage, ...include.map((n) => './' + n), ...(manifest.entries.length ? ['-C', DATA, ...manifest.entries.map((n) => './' + n)] : [])], { encoding: 'utf8' });
    if (tar.status !== 0 && tar.status !== 1) throw new Error('tar failed: ' + first(tar.stderr || '')); // 1: a file changed while it was read, which a copy of live files may meet
    chmodSync(partial, 0o600);
    renameSync(partial, archive);
    const record = { id, ...manifest, archive: { file: id + '.tar.gz', bytes: statSync(archive).size, sha256: sha256(archive) } };
    writeFileSync(join(OUT, id + '.json'), JSON.stringify(record, null, 2), { mode: 0o600 });
    const result = { id, createdAt: manifest.createdAt, bytes: record.archive.bytes, tables: manifest.tables, files: manifest.files, database: !!manifest.database, stopped, s3: null, pruned: [] };
    if (s3Configured()) {
      try {
        const sent = await s3put(archive, id + '.tar.gz', 'application/gzip');
        await s3put(join(OUT, id + '.json'), id + '.json', 'application/json');
        result.s3 = { ok: true, key: sent.key };
        writeFileSync(join(OUT, id + '.json'), JSON.stringify({ ...record, elsewhere: true }, null, 2), { mode: 0o600 });
      } catch (error) {
        result.s3 = { ok: false, error: String(error.message || error).replace(/[A-Za-z0-9+/=_-]{24,}/g, '<hidden>') };
        say('error', 'the copy to storage failed', { id, text: result.s3.error });
      }
    }
    result.pruned = prune();
    return result;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

function list() {
  if (!existsSync(OUT)) return [];
  return readdirSync(OUT)
    .filter((n) => n.endsWith('.json') && ID.test(n.slice(0, -5)))
    .map((n) => {
      const { hashes, entries, ...rest } = JSON.parse(readFileSync(join(OUT, n), 'utf8'));
      return rest;
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1));
}

/** Backups older than KEEP_DAYS go, except the newest three, which always stay. */
function prune() {
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  const gone = [];
  list().forEach((b, i) => {
    if (i >= 3 && Date.parse(b.createdAt) < cutoff) {
      rmSync(join(OUT, b.id + '.tar.gz'), { force: true });
      rmSync(join(OUT, b.id + '.json'), { force: true });
      gone.push(b.id);
    }
  });
  return gone;
}

const recordOf = (id) => JSON.parse(readFileSync(join(OUT, id + '.json'), 'utf8'));
const exists = (path) => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

/** Unpack an archive into a scratch folder (nothing of the data folder is touched). */
function unpack(id) {
  if (!ID.test(id) || !existsSync(join(OUT, id + '.tar.gz')) || !existsSync(join(OUT, id + '.json'))) throw new Error('there is no backup called ' + id);
  const record = recordOf(id);
  if (sha256(join(OUT, id + '.tar.gz')) !== record.archive.sha256) throw new Error('the archive of ' + id + ' is not the file that was written (its SHA-256 differs)');
  const scratch = mkdtempSync(join(tmpdir(), 'hydor-restore-'));
  const tar = spawnSync('tar', ['-xzf', join(OUT, id + '.tar.gz'), '-C', scratch], { encoding: 'utf8' });
  if (tar.status !== 0) {
    rmSync(scratch, { recursive: true, force: true });
    throw new Error('the archive could not be unpacked: ' + first((tar.stderr || '').trim()));
  }
  return { scratch, record };
}

/** Restore an archive into a scratch folder and read it back: SQLite's own check, the rows of each table, the files. */
function verify(id) {
  let opened;
  try {
    opened = unpack(id);
  } catch (error) {
    return { id, ok: false, integrity: null, found: {}, problems: [String(error.message || error)] };
  }
  const { scratch, record } = opened;
  try {
    const problems = [];
    const result = { id, ok: false, integrity: null, found: {}, problems };
    if (record.database) {
      const file = join(scratch, record.database.file);
      if (!existsSync(file)) problems.push('the database is missing from the archive');
      else {
        result.integrity = sqlite(file, 'pragma integrity_check').trim();
        if (result.integrity !== 'ok') problems.push('the database in the backup fails its own check: ' + first(result.integrity));
        result.found = counts(file);
        for (const [table, n] of Object.entries(record.tables)) if (result.found[table] !== n) problems.push('the table ' + table + ' has ' + result.found[table] + ' rows in the backup, and the backup said ' + n);
      }
    }
    for (const e of record.entries) if (!exists(join(scratch, e))) problems.push(e + ' is missing from the archive');
    for (const [rel, hash] of Object.entries(record.hashes || {})) {
      if (!exists(join(scratch, rel))) problems.push(rel + ' is missing from the archive');
      else if (hashOf(scratch, filesUnder(scratch, rel, [])[0]) !== hash) problems.push(rel + ' in the archive is not the file that was copied');
      if (problems.length > 10) break;
    }
    result.ok = problems.length === 0;
    return result;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const own = (owner, paths) => spawnSync('chown', ['-R', owner.uid + ':' + owner.gid, ...paths]);

/** Make the data folder what an unpacked archive holds. Copied, not renamed: the two are on different file systems in a container. */
function place(from) {
  const owner = statSync(DATA);
  for (const n of readdirSync(DATA)) if (n !== 'lost+found') rmSync(join(DATA, n), { recursive: true, force: true });
  if (from.record.database) cpSync(join(from.scratch, from.record.database.file), join(DATA, from.record.database.file));
  for (const e of from.record.entries) cpSync(join(from.scratch, e), join(DATA, e), { recursive: true, verbatimSymlinks: true });
  own(owner, [DATA]);
}

/** A copy of what is there now, before something replaces it. */
async function safetyCopy() {
  if (!existsSync(DATA) || readdirSync(DATA).filter((n) => n !== 'lost+found').length === 0) return null;
  const was = process.env.HYDOR_STOPPED;
  process.env.HYDOR_STOPPED = '1';
  try {
    return (await now('before-restore')).id;
  } finally {
    process.env.HYDOR_STOPPED = was || '';
  }
}

/**
 * Put a backup back. The app must be stopped (whoever calls this stops it). The backup is checked and unpacked first, and
 * the data as it is now is backed up under the label before-restore, all before anything is removed; if putting the files
 * in place fails half way, the data as it was is put back from that copy.
 */
async function restore(id) {
  const checked = verify(id);
  if (!checked.ok) throw new Error('that backup does not pass its checks, so nothing was changed: ' + checked.problems.join('; '));
  const wanted = unpack(id);
  let safety = null;
  let before = null;
  try {
    safety = await safetyCopy();
    if (safety) before = unpack(safety);
    try {
      place(wanted);
    } catch (error) {
      if (before) place(before);
      throw new Error('the backup could not be put in place (' + first(error.message || error) + '); the data was put back as it was' + (before ? ' from ' + safety : ''));
    }
    return { id, restored: true, safety, tables: wanted.record.tables };
  } finally {
    rmSync(wanted.scratch, { recursive: true, force: true });
    if (before) rmSync(before.scratch, { recursive: true, force: true });
  }
}

/** With the app stopped for a switch of versions: remember the data as it is (a SQLite file is copied), and say what it is. */
function mark() {
  rmSync(MARK, { recursive: true, force: true });
  mkdirSync(MARK, { recursive: true, mode: 0o700 });
  if (SQLITE && existsSync(DB)) sqlite(DB, ".backup '" + join(MARK, 'db') + "'");
  return fingerprint();
}

/** Put the database back as it was marked. What is there now is kept as a backup first. */
async function revert() {
  const marked = join(MARK, 'db');
  if (!SQLITE || !existsSync(marked)) throw new Error('there is no marked database to put back');
  if (sqlite(marked, 'pragma integrity_check').trim() !== 'ok') throw new Error('the marked copy of the database fails its own check');
  let safety = null;
  try {
    safety = await safetyCopy();
  } catch (error) {
    say('error', 'what is there now could not be kept', { text: first(error.message || error) });
  }
  const owner = statSync(existsSync(DB) ? DB : DATA);
  for (const n of sideFiles()) rmSync(join(DATA, n), { force: true });
  cpSync(marked, DB);
  own(owner, [DB]);
  return { reverted: true, safety };
}

async function daemon() {
  const [hh, mm] = AT.split(':').map(Number);
  if (!SQLITE) {
    say('info', 'this app is stopped while it is copied, which the server does by its own schedule', { at: AT + ' UTC' });
    for (;;) await sleep(3600000);
  }
  say('info', 'backups are scheduled', { at: AT + ' UTC', keepDays: KEEP_DAYS, storage: s3Configured() ? 'also copied to ' + process.env.BACKUP_S3_BUCKET : 'on this machine only' });
  for (;;) {
    const d = new Date();
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh, mm, 0));
    if (next.getTime() <= d.getTime() + 1000) next.setUTCDate(next.getUTCDate() + 1);
    await sleep(next.getTime() - Date.now());
    try {
      const r = await locked(() => now('scheduled'));
      say('info', 'a backup was made', { id: r.id, bytes: r.bytes, s3: r.s3 ? r.s3.ok : null });
    } catch (error) {
      say('error', 'a backup failed', { text: first(error.message || error) });
    }
  }
}

/** Whether the app answers its ready address (2xx or 3xx), asked on the project's own network with the real name. */
function probe() {
  return new Promise((resolve) => {
    const req = httpRequest({ hostname: 'app', port: Number(process.env.HYDOR_PORT || 3000), path: process.env.HYDOR_READY || '/', headers: { host: process.env.HYDOR_HOST_HEADER || 'app', 'x-forwarded-proto': 'https', 'user-agent': 'hydor-launch' }, timeout: 4000 }, (res) => {
      res.resume();
      resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, say: 'it answered ' + res.statusCode });
    });
    req.on('timeout', () => req.destroy(new Error('no answer in time')));
    req.on('error', (error) => resolve({ ok: false, say: error.code === 'ECONNREFUSED' ? 'nothing listened on the port' : first(error.message) }));
    req.end();
  });
}

/** The addresses listened on in this network namespace (run beside the app, to say why nothing reaches it). */
function listening() {
  const out = [];
  for (const [file, six] of [['/proc/net/tcp', false], ['/proc/net/tcp6', true]]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n').slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts[3] !== '0A') continue;
      const [hex, port] = parts[1].split(':');
      const any = /^0+$/.test(hex);
      const loop = six ? hex === '00000000000000000000000001000000' || hex.endsWith('0100007F') : hex.endsWith('7F');
      out.push((any ? 'every address' : loop ? 'this machine only' : 'one address') + ':' + parseInt(port, 16));
    }
  }
  return [...new Set(out)];
}

const [command, arg] = process.argv.slice(2);
const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const print = (v) => console.log(JSON.stringify(v));
try {
  if (command === 'now') {
    const label = flag('--label');
    if (label && !/^[a-z0-9-]{1,40}$/.test(label)) throw new Error('a label is lower-case letters, digits and hyphens');
    print(await locked(() => now(label)));
  } else if (command === 'list') print(list());
  else if (command === 'verify') {
    const r = verify(arg || '');
    print(r);
    process.exitCode = r.ok ? 0 : 1;
  } else if (command === 'restore') print(await locked(() => restore(arg || '')));
  else if (command === 'mark') print(await locked(async () => mark()));
  else if (command === 'revert') print(await locked(() => revert()));
  else if (command === 'fingerprint') print(fingerprint());
  else if (command === 'prune') print(prune());
  else if (command === 'daemon') await daemon();
  else if (command === 'probe') {
    const r = await probe();
    print(r);
    process.exitCode = r.ok ? 0 : 1;
  } else if (command === 'listening') print(listening());
  else {
    console.error('hydor-backup now [--label x] | list | verify <id> | restore <id> | mark | revert | fingerprint | prune | daemon | probe | listening');
    process.exitCode = 2;
  }
} catch (error) {
  console.error(JSON.stringify({ level: 'error', text: first(error.message || error) }));
  process.exitCode = 1;
}
`;
