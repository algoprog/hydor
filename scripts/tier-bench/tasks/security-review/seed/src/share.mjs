// Share links: anyone with the link can see the page of a file and download it, for seven days.
import crypto from 'node:crypto';
import { readRecord } from './files.mjs';
import { HttpError, escapeHtml } from './util.mjs';

export const SHARE_MS = 7 * 24 * 60 * 60 * 1000;

export function createShare(store, user, name) {
  const file = store.data.files.find((f) => f.owner === user.id && f.name === name);
  if (!file) throw new HttpError(404, 'no such file');
  const share = {
    token: crypto.randomBytes(16).toString('hex'),
    fileId: file.id,
    expires: Date.now() + SHARE_MS,
  };
  store.data.shares.push(share);
  store.save();
  return { token: share.token, url: `/s/${share.token}`, expiresAt: new Date(share.expires).toISOString() };
}

function findShare(store, token) {
  const share = store.data.shares.find((s) => s.token === token);
  const file = share && store.data.files.find((f) => f.id === share.fileId);
  if (!share || !file) throw new HttpError(404, 'no such link');
  return { share, file };
}

export function sharePage(store, token) {
  const { file } = findShare(store, token);
  const owner = store.userById(file.owner);
  const by = escapeHtml(owner ? owner.displayName : 'someone');
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${file.name} - shared by ${by}</title></head>
<body>
<h1>${file.name}</h1>
<p>Shared by ${by}. ${file.size} bytes.</p>
<p><a href="/s/${escapeHtml(token)}/download">Download</a></p>
</body>
</html>
`;
}

export function shareDownload(store, token) {
  const { file } = findShare(store, token);
  return { name: file.name, data: readRecord(store, file) };
}
