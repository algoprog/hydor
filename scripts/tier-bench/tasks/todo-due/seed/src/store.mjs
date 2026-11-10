import fs from 'node:fs';

// The items live in a JSON file: an array of { id, title, done }. Its path is in the TODO_FILE environment variable.
function file() {
  return process.env.TODO_FILE ?? 'todos.json';
}

export function load() {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export function save(items) {
  fs.writeFileSync(file(), JSON.stringify(items, null, 2) + '\n');
}

export function nextId(items) {
  return items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}
