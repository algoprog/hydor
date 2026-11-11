// The data of the service: one JSON file in the data folder, kept in memory and written after every change.
import fs from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'db.json');
    fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
    this.data = { users: [], files: [], shares: [], sessions: [] };
    if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    this.data.sessions ??= [];
  }

  // Writes the data to a temporary file first, so a crash never leaves half a file.
  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  userByName(name) {
    return this.data.users.find((u) => u.name === name);
  }

  userById(id) {
    return this.data.users.find((u) => u.id === id);
  }
}
