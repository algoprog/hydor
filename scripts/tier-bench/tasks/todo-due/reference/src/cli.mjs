import { load, save, nextId } from './store.mjs';

const USAGE = 'usage: todo add <title> [--due YYYY-MM-DD] | list [--overdue] [--json] [--today YYYY-MM-DD] | done <id> | remove <id> | stats [--today YYYY-MM-DD]';

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

function isRealDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text ?? '');
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return month >= 1 && month <= 12 && day >= 1 && day <= days;
}

function parseArgs(args) {
  const flags = {};
  const words = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--due' || a === '--today') flags[a.slice(2)] = args[++i] ?? '';
    else if (a === '--overdue' || a === '--json') flags[a.slice(2)] = true;
    else words.push(a);
  }
  return { flags, words };
}

function localToday() {
  const d = new Date();
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function sortByDue(items) {
  return [...items].sort((a, b) => {
    const da = a.due ?? '￿';
    const db = b.due ?? '￿';
    return da < db ? -1 : da > db ? 1 : a.id - b.id;
  });
}

function main(argv) {
  const [command, ...rest] = argv;
  const { flags, words } = parseArgs(rest);
  const items = load();
  let today = null;
  if ('today' in flags) {
    if (!isRealDate(flags.today)) fail(`invalid --today date: "${flags.today}" (use YYYY-MM-DD)`, 2);
    today = flags.today;
  }
  today ??= localToday();
  const isOverdue = (i) => !i.done && i.due != null && i.due < today;

  if (command === 'add') {
    const title = words.join(' ').trim();
    if (!title) fail(USAGE, 2);
    if ('due' in flags && !isRealDate(flags.due)) fail(`invalid --due date: "${flags.due}" (use YYYY-MM-DD)`, 2);
    const item = { id: nextId(items), title, done: false, due: flags.due ?? null };
    save([...items, item]);
    console.log(`added #${item.id}`);
  } else if (command === 'list') {
    let shown = sortByDue(items.filter((i) => !i.done));
    if (flags.overdue) shown = shown.filter(isOverdue);
    if (flags.json) {
      console.log(JSON.stringify(shown.map((i) => ({ id: i.id, title: i.title, done: Boolean(i.done), due: i.due ?? null }))));
    } else {
      if (shown.length === 0) console.log('nothing to do');
      for (const item of shown) console.log(`#${item.id} ${item.title}${item.due ? ` (due ${item.due})` : ''}`);
    }
  } else if (command === 'stats') {
    const open = items.filter((i) => !i.done).length;
    console.log(`open: ${open}, done: ${items.length - open}, overdue: ${items.filter(isOverdue).length}`);
  } else if (command === 'done') {
    const item = findItem(items, words[0]);
    item.done = true;
    save(items);
    console.log(`done #${item.id}`);
  } else if (command === 'remove') {
    const item = findItem(items, words[0]);
    save(items.filter((i) => i !== item));
    console.log(`removed #${item.id}`);
  } else {
    fail(USAGE, 2);
  }
}

main(process.argv.slice(2));
