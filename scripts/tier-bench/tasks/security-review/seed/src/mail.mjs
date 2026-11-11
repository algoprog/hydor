// "Sends" an e-mail. This service has no mail server yet, so each message is a line in outbox.jsonl in the data folder.
import fs from 'node:fs';
import path from 'node:path';

export function sendMail(store, message) {
  const line = JSON.stringify({ ...message, at: new Date().toISOString() });
  fs.appendFileSync(path.join(store.dir, 'outbox.jsonl'), `${line}\n`);
}
