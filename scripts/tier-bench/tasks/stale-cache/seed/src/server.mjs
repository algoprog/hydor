// A small server around the profile cache: GET /u/:id?as=:viewer shows a profile page, POST /u/:id with a JSON
// body of changes updates it. Start it with `npm start`.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createDb } from './db.mjs';
import { createProfiles } from './profiles.mjs';
import { renderProfilePage } from './pages.mjs';

export function createApp() {
  const db = createDb([
    { email: 'ann.lee@example.com', name: 'Ann Lee', bio: 'Likes boats.' },
    { email: 'bob@example.com', name: 'Bob', bio: 'Likes trains.' },
  ]);
  const profiles = createProfiles({ db });

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const match = /^\/u\/([^/]+)$/.exec(url.pathname);
    if (!match) {
      res.writeHead(404).end('not found');
      return;
    }
    const id = decodeURIComponent(match[1]);
    try {
      if (req.method === 'GET') {
        const html = await renderProfilePage(profiles, url.searchParams.get('as'), id);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
      } else if (req.method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const profile = await profiles.update(id, JSON.parse(body));
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(profile));
      } else {
        res.writeHead(405).end('method not allowed');
      }
    } catch (error) {
      res.writeHead(500).end(String(error.message));
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createApp().listen(Number(process.env.PORT) || 3000);
}
