// Tests that the live lessons preview performs SELECTs only and obeys session privacy switches.
import assert from 'node:assert/strict';
import type { RunCtx } from '../../features/types.ts';
import { lessonsTools } from './tools.ts';

const calls: string[] = [];
let globalMemory = true;
let extra = '{}';
const db = {
  prepare(sql: string) {
    calls.push(sql);
    assert.match(sql, /^select /i);
    return {
      get: () => sql.includes('app_sessions') ? { extra } : { v: globalMemory ? '1' : '0' },
      all: () => [{ id: 1, kind: 'user', text: 'The retry limit should be three.', ts: 1 }],
    };
  },
};
const ctx = { key: 'codex:test', cwd: '/tmp', deps: { db } } as unknown as RunCtx;
const tools = lessonsTools(() => '/wiki');
const preview = tools.find((t) => t.name === 'wiki_lessons_preview')!;
const result = JSON.parse(String(await preview.run({ candidates: [{ title: 'Retries', lesson: 'Use three retries.', evidence: 'User correction', uncertainty: 'Not tested', sourceIds: ['chunk:1'] }] }, ctx)));
assert.equal(result.lessons.length, 1);
assert.equal(result.target, '/wiki');
assert.ok(calls.every((sql) => /^select /i.test(sql)));
extra = '{"memory":false}';
await assert.rejects(() => preview.run({ candidates: [] }, ctx), /memory off/);
extra = '{"confidential":true}';
await assert.rejects(() => preview.run({ candidates: [] }, ctx), /confidential/);
extra = '{}';
globalMemory = false;
await assert.rejects(() => preview.run({ candidates: [] }, ctx), /memory off/);
console.log('Lessons tool privacy and dry-run tests passed');
