// Starts the service on a free port with a data folder of its own, and a small client for it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.mjs';

export async function start({ adminPassword = 'admin-password' } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filebox-test-'));
  const server = await createApp({ dataDir, adminPassword });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  // Sends a request; json is sent as the body (or body as it is) and the answer is read as text, bytes and JSON.
  async function api(method, url, { token, json, body, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    if (token) init.headers.authorization = `Bearer ${token}`;
    if (json !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(json);
    } else if (body !== undefined) {
      init.body = body;
    }
    const res = await fetch(base + url, init);
    const bytes = Buffer.from(await res.arrayBuffer());
    let parsed;
    try {
      parsed = JSON.parse(bytes.toString('utf8'));
    } catch {
      parsed = undefined;
    }
    return { status: res.status, headers: res.headers, bytes, text: bytes.toString('utf8'), json: parsed };
  }

  // Signs up and logs in; answers the token.
  async function account(name, password = 'a-long-password') {
    const made = await api('POST', '/signup', { json: { name, password, email: `${name}@example.com` } });
    if (made.status !== 201) throw new Error(`sign-up of ${name} answered ${made.status}`);
    return (await login(name, password)).json.token;
  }

  const login = (name, password) => api('POST', '/login', { json: { name, password } });

  return {
    api,
    account,
    login,
    dataDir,
    adminToken: async () => (await login('admin', adminPassword)).json.token,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
