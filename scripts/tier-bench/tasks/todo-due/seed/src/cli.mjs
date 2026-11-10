import { load, save, nextId } from './store.mjs';

const USAGE = 'usage: todo add <title> | list | done <id> | remove <id>';

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function findItem(items, text) {
  const id = Number(text);
  const item = items.find((i) => i.id === id);
  if (!item) fail(`no item #${text}`);
  return item;
}

function main(argv) {
  const [command, ...args] = argv;
  const items = load();

  if (command === 'add') {
    const title = args.join(' ').trim();
    if (!title) fail(USAGE, 2);
    const item = { id: nextId(items), title, done: false };
    save([...items, item]);
    console.log(`added #${item.id}`);
  } else if (command === 'list') {
    const open = items.filter((i) => !i.done);
    if (open.length === 0) console.log('nothing to do');
    for (const item of open) console.log(`#${item.id} ${item.title}`);
  } else if (command === 'done') {
    const item = findItem(items, args[0]);
    item.done = true;
    save(items);
    console.log(`done #${item.id}`);
  } else if (command === 'remove') {
    const item = findItem(items, args[0]);
    save(items.filter((i) => i !== item));
    console.log(`removed #${item.id}`);
  } else {
    fail(USAGE, 2);
  }
}

main(process.argv.slice(2));
