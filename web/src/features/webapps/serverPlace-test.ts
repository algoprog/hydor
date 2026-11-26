import assert from 'node:assert/strict';
import { envFor } from './serverPlace';

assert.equal(envFor([], 'vps'), 'production');
assert.equal(envFor([{ env: 'production', host: 'vps' }], 'vps'), 'production');
assert.equal(envFor([{ env: 'staging', host: 'vps' }], 'vps'), 'staging', 'what the server holds keeps its place');
assert.equal(envFor([{ env: 'staging', host: 'other' }], 'vps'), 'production');
assert.equal(envFor([{ env: 'production', host: 'other' }], 'vps'), 'vps', 'a second server is a second place');
assert.equal(envFor([{ env: 'production', host: 'other' }], 'hydor'), 'server-hydor');
assert.equal(envFor([{ env: 'production', host: 'other' }], 'production'), 'production-2');
console.log('ok - the place a launch to a server is for\n1 checks passed.');
