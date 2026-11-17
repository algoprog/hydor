// Where wiki memory lives, and that nothing an agent can write points a wiki outside the hub or its project.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db.ts';
import type { RunCtx } from '../features/types.ts';
import { createSpace, updateSpace } from '../spaces/index.ts';
import { namedWikiRoot, plainRelative, projectDir, unregisteredWikiRoot, wikiMemoryOn, wikiRoot } from './roots.ts';
import { setWikiSettings } from './settings/settings.ts';
import { wikiTools } from './tools.ts';

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-roots-')));
const db = openDb(path.join(tmp, 'app.db'));
const hub = path.join(tmp, 'hub');
const outside = path.join(tmp, 'outside');
const keys = path.join(tmp, 'home', '.ssh');
try {
  fs.mkdirSync(path.join(outside, 'wiki'), { recursive: true });
  fs.mkdirSync(keys, { recursive: true });
  fs.writeFileSync(path.join(keys, 'id_rsa'), '-----BEGIN OPENSSH PRIVATE KEY-----\nsecret\n');
  fs.writeFileSync(path.join(outside, 'wiki', 'private.md'), 'an outside file');
  const projectFolder = path.join(tmp, 'shop');
  fs.mkdirSync(projectFolder);
  const shop = createSpace(db, { name: 'Shop website!', folder: projectFolder });

  // ---- defaults and switches
  setWikiSettings(db, { hubPath: hub });
  assert.equal(wikiMemoryOn(db, null), true, 'on by default');
  assert.equal(wikiMemoryOn(db, shop.id), true);
  assert.equal(wikiRoot(db, null), null, 'nothing is made by looking');
  assert.equal(fs.existsSync(hub), false);
  updateSpace(db, shop.id, { wikiMemory: false });
  assert.equal(wikiMemoryOn(db, shop.id), false);
  assert.equal(wikiRoot(db, shop.id, { create: true }), null, 'off: no folder, even with create');
  updateSpace(db, shop.id, { wikiMemory: null });
  setWikiSettings(db, { enabled: false });
  assert.equal(wikiMemoryOn(db, shop.id), false, 'follows Settings');
  updateSpace(db, shop.id, { wikiMemory: true });
  assert.equal(wikiMemoryOn(db, shop.id), true, 'its own switch wins');
  assert.equal(wikiRoot(db, null, { create: true }), null, 'the shared wiki follows Settings');
  updateSpace(db, shop.id, { wikiMemory: null });
  setWikiSettings(db, { enabled: true });

  // ---- the hub is made on first use, with wiki/ and raw/
  const shared = wikiRoot(db, null, { create: true })!;
  assert.equal(shared, fs.realpathSync(hub));
  assert.ok(fs.statSync(path.join(shared, 'wiki')).isDirectory() && fs.statSync(path.join(shared, 'raw')).isDirectory());

  // ---- a project's wiki in the hub: readable name + id suffix, chosen once
  setWikiSettings(db, { projectWikis: 'hub' });
  assert.equal(wikiRoot(db, shop.id), null, 'missing without create');
  const mine = wikiRoot(db, shop.id, { create: true })!;
  const dir = projectDir(db, shop.id, shop.name);
  assert.match(dir, /^shop-website-[0-9a-f]{6}$/);
  assert.equal(mine, path.join(shared, 'projects', dir));
  assert.ok(fs.existsSync(path.join(mine, 'wiki')) && fs.existsSync(path.join(mine, 'raw')));
  updateSpace(db, shop.id, { name: 'Renamed shop' });
  assert.equal(wikiRoot(db, shop.id), mine, 'renaming does not move the wiki');
  assert.equal(wikiRoot(db, 'spunknown', { create: true }), null);

  // ---- folder mode: inside the project's folder
  setWikiSettings(db, { projectWikis: 'folder', projectPath: '.wiki' });
  assert.equal(wikiRoot(db, shop.id), null);
  const inFolder = wikiRoot(db, shop.id, { create: true })!;
  assert.equal(inFolder, path.join(projectFolder, '.wiki'));
  setWikiSettings(db, { projectWikis: 'hub' });
  assert.equal(wikiRoot(db, shop.id), mine);

  // ---- AGENTS.md bindings: relative and inside the project win; anything else is ignored, never an error
  const agents = path.join(projectFolder, 'AGENTS.md');
  const bind = (spec: string) => fs.writeFileSync(agents, `# Project\n\n- Wiki: \`${spec}\`\n`);
  bind('knowledge/wiki/_index.md');
  assert.equal(wikiRoot(db, shop.id), null, 'a valid binding wins, its folder is missing');
  const bound = wikiRoot(db, shop.id, { create: true })!;
  assert.equal(bound, path.join(projectFolder, 'knowledge', 'wiki'));
  assert.ok(fs.existsSync(path.join(bound, 'raw')));
  for (const bad of [keys, `~/.ssh`, '../outside', 'sub/../../outside', '.git/hooks', '.sessions/x', '.', './', '/etc', 'C:\\Users\\x', 'a\\..\\b']) {
    bind(bad);
    assert.equal(wikiRoot(db, shop.id), mine, `binding ${JSON.stringify(bad)} is ignored: the project keeps its own wiki`);
    assert.equal(wikiRoot(db, shop.id, { create: true }), mine);
  }
  // A symbolic link inside the project that leads outside is refused too.
  fs.symlinkSync(outside, path.join(projectFolder, 'linked'));
  bind('linked');
  assert.equal(wikiRoot(db, shop.id, { create: true }), mine, 'a symlinked binding is ignored');
  bind('linked/wiki');
  assert.equal(wikiRoot(db, shop.id, { create: true }), mine);
  assert.equal(fs.readdirSync(outside).join(), 'wiki', 'nothing was made outside');
  // A worktree may explicitly bind the already configured shared hub, but not arbitrary outside paths.
  bind('../hub/_index.md');
  assert.equal(wikiRoot(db, shop.id), shared, 'a relative binding to the configured hub is accepted');
  fs.renameSync(path.join(projectFolder, '.wiki'), path.join(projectFolder, '.wiki-local'));
  fs.symlinkSync(shared, path.join(projectFolder, '.wiki'));
  bind('.wiki/_index.md');
  assert.equal(wikiRoot(db, shop.id), shared, 'a worktree symlink to the configured hub is accepted');
  fs.unlinkSync(path.join(projectFolder, '.wiki'));
  fs.renameSync(path.join(projectFolder, '.wiki-local'), path.join(projectFolder, '.wiki'));
  fs.rmSync(agents);
  // A binding wins in folder mode as well.
  setWikiSettings(db, { projectWikis: 'folder' });
  bind('knowledge/wiki');
  assert.equal(wikiRoot(db, shop.id), bound);
  fs.rmSync(agents);
  setWikiSettings(db, { projectWikis: 'hub' });

  // ---- a symlinked folder inside the hub leading outside is refused
  fs.mkdirSync(path.join(tmp, 'p2'));
  const proj2 = createSpace(db, { name: 'Linked', folder: path.join(tmp, 'p2') });
  const d2 = projectDir(db, proj2.id, proj2.name);
  fs.symlinkSync(outside, path.join(shared, 'projects', d2));
  assert.throws(() => wikiRoot(db, proj2.id, { create: true }), /outside/);
  fs.unlinkSync(path.join(shared, 'projects', d2));

  // ---- named wikis: relative paths inside the hub only
  fs.mkdirSync(path.join(shared, 'topics', 'one', 'wiki'), { recursive: true });
  fs.mkdirSync(path.join(shared, 'topics', 'old'), { recursive: true });
  fs.symlinkSync(outside, path.join(shared, 'topics', 'sneaky'));
  const registry = (wikis: Record<string, unknown>) => fs.writeFileSync(path.join(shared, 'wikis.json'), JSON.stringify({ wikis }));
  registry({
    one: { path: 'topics/one' }, portable: { path: '<HUB>/topics/one' }, implicit: {}, old: { path: 'topics/old', status: 'archived' },
    absolute: { path: keys }, tilde: { path: '~/.ssh' }, up: { path: '../outside' }, hubup: { path: '<HUB>/../outside' }, deep: { path: 'topics/../../outside' },
    sneaky: { path: 'topics/sneaky' }, sessions: { path: '.sessions' }, git: { path: '.git' }, projects: { path: 'projects' }, mine: { path: `projects/${dir}` }, internal: { path: 'topics/.hydor-x' },
  });
  fs.mkdirSync(path.join(shared, 'topics', 'implicit'));
  assert.equal(namedWikiRoot(db, 'hub'), shared);
  assert.equal(namedWikiRoot(db, 'one'), path.join(shared, 'topics', 'one'));
  assert.equal(namedWikiRoot(db, 'portable'), path.join(shared, 'topics', 'one'));
  assert.equal(namedWikiRoot(db, 'implicit'), path.join(shared, 'topics', 'implicit'));
  assert.throws(() => namedWikiRoot(db, 'old'), /Archived/);
  assert.throws(() => namedWikiRoot(db, 'unknown'), /registered/);
  assert.throws(() => namedWikiRoot(db, '__proto__'), /registered/);
  for (const bad of ['absolute', 'tilde', 'up', 'hubup', 'deep', 'sneaky', 'sessions', 'git', 'projects', 'mine', 'internal']) assert.throws(() => namedWikiRoot(db, bad), /relative folder|outside|inside/, `registry entry ${bad} is refused`);
  fs.rmSync(path.join(shared, 'wikis.json'));
  // Existing unregistered project wikis remain distinct from the shared hub.
  const unregistered = path.join(tmp, 'unregistered');
  fs.mkdirSync(unregistered);
  assert.equal(unregisteredWikiRoot(db, unregistered), undefined, 'without a wiki, the caller may use the hub');
  fs.mkdirSync(path.join(unregistered, '.wiki'));
  assert.equal(unregisteredWikiRoot(db, unregistered), path.join(unregistered, '.wiki'));
  const instructions = path.join(unregistered, 'AGENTS.md');
  fs.writeFileSync(instructions, '- Wiki: `../hub/_index.md`\n');
  assert.equal(unregisteredWikiRoot(db, unregistered), shared, 'an explicit exact-hub binding is accepted');
  fs.writeFileSync(instructions, '- Wiki: `../outside/_index.md`\n');
  assert.equal(unregisteredWikiRoot(db, unregistered), null, 'an invalid explicit binding never falls back to the hub');
  fs.unlinkSync(instructions);
  fs.rmdirSync(path.join(unregistered, '.wiki'));
  fs.symlinkSync(shared, path.join(unregistered, '.wiki'));
  assert.equal(unregisteredWikiRoot(db, unregistered), shared, 'a worktree link to the exact hub is accepted');
  fs.unlinkSync(path.join(unregistered, '.wiki'));
  fs.symlinkSync(outside, path.join(unregistered, '.wiki'));
  assert.equal(unregisteredWikiRoot(db, unregistered), null, 'another external link fails closed');
  assert.throws(() => namedWikiRoot(db, 'one'), /registered/);

  // ---- the tools: a session reaches only what roots resolves
  const deps = { db } as unknown as RunCtx['deps'];
  const ctx = { key: 'test:roots', runId: 'r', agent: 'codex', cwd: projectFolder, deps } as unknown as RunCtx;
  const tool = (name: string) => wikiTools().find((t) => t.name === name)!;
  const call = async (name: string, args: Record<string, unknown>) => JSON.parse(String(await tool(name).run(args, ctx)));
  registry({ absolute: { path: keys }, up: { path: '../outside' }, sneaky: { path: 'topics/sneaky' } });
  fs.writeFileSync(path.join(shared, 'index.md'), '# Shared\n');
  bind(keys);
  assert.equal((await call('wiki_status', {})).root, mine, 'an absolute binding does not reach the SSH folder');
  for (const wiki of ['absolute', 'up', 'sneaky']) {
    await assert.rejects(call('wiki_read', { path: 'id_rsa', wiki }), /relative folder|outside|inside/);
    await assert.rejects(call('wiki_write', { path: 'wiki/x.md', content: 'x', expectedSha256: null, wiki }), /relative folder|outside|inside/);
  }
  assert.equal(fs.readdirSync(keys).join(), 'id_rsa', 'nothing was written next to the key');
  fs.rmSync(agents);
  // The hub's other folders are not readable through the shared wiki: projects/ belongs to the projects.
  fs.writeFileSync(path.join(mine, 'wiki', 'secret-plan.md'), '# Plan\n');
  await assert.rejects(call('wiki_read', { path: `projects/${dir}/wiki/secret-plan.md`, wiki: 'hub' }), /holds its files in/);
  assert.equal((await call('wiki_read', { path: 'index.md', wiki: 'hub' })).content, '# Shared\n');
  fs.rmSync(path.join(shared, 'wikis.json'));
  // A session outside any project works in the shared wiki; wikis.json cannot be created by an agent.
  const free = { ...ctx, cwd: path.join(tmp, 'nowhere') } as RunCtx;
  assert.equal(JSON.parse(String(await tool('wiki_status').run({}, free))).root, shared);
  await assert.rejects(tool('wiki_write').run({ path: 'wikis.json', content: '{"wikis":{"x":{"path":"/etc"}}}', expectedSha256: null }, free), /written only in/);
  assert.equal(fs.existsSync(path.join(shared, 'wikis.json')), false);

  // ---- helpers
  assert.deepEqual(plainRelative('a/b/./c/'), ['a', 'b', 'c']);
  for (const bad of ['', '/a', '~', '~/a', '..', 'a/../b', '.git', 'a/.git/b', '.hydor-x', 'a\\b', 'a\0b', 'C:/x']) assert.equal(plainRelative(bad), null, JSON.stringify(bad));

  console.log('Wiki roots: placement, switches, bindings, registry and tool boundaries passed');
} finally {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
