# A flashcard page

A page to save with `save_page`. It shows the cards that are due, one at a time, keeps every card
and its schedule in `naget.storage` (so progress survives, on any device that opens the page), and
lets the person add, list and delete cards. It uses the page kit's classes and colours, so it fits
the app in light and dark.

What to change: `TITLE`, the `SEED` cards (front and back), and if wanted `NEW_PER_DAY` and
`BOX_DAYS`. Leave the rest as it is.

How it schedules: every card sits in a box. A new card starts in box 0. **Good** moves it up one box,
**Easy** two; it comes back after the box's days (1, 3, 7, 14, 30, 60). **Again** puts it back in
box 0, and it comes back in the same sitting. At most `NEW_PER_DAY` new cards are introduced a day.

Adding cards later: save a new version of the page (`save_page` with its id) with more cards in
`SEED`. Cards are matched by their front and back, so the ones already there keep their progress,
the new ones arrive as new cards, and cards the person deleted stay deleted. One page holds up to
about 1,500 short cards (half a megabyte); split a bigger deck into several pages.

Keys: Space or Enter shows the answer; 1, 2, 3 answer Again, Good, Easy.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Flashcards</title>
<style>
  main { display: grid; gap: 16px; }
  .study { padding: 18px; gap: 14px; }
  .face { min-height: 110px; display: grid; place-items: center; text-align: center; font-size: 20px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
  .back { border-top: 1px solid var(--n-line); padding-top: 14px; }
  .grades { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .grades .n-btn, #show { height: 44px; }
  .bar { height: 6px; border-radius: 3px; background: var(--n-soft); overflow: hidden; }
  .bar > i { display: block; height: 100%; width: 0; background: var(--n-accent); }
  details { background: var(--n-card); border: 1px solid var(--n-line); border-radius: var(--n-radius); padding: 12px 14px; }
  summary { cursor: pointer; font-weight: 600; }
  details[open] > summary { margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--n-line); vertical-align: top; overflow-wrap: anywhere; }
  textarea { width: 100%; box-sizing: border-box; }
  #msg:empty { display: none; }
  #msg { color: var(--n-err); }
  [hidden] { display: none !important; }
</style>
</head>
<body class="n-page">
<main>
  <header>
    <h1 id="title">Flashcards</h1>
    <div class="n-row"><span class="n-tag" id="due-tag"></span><span class="n-tag" id="new-tag"></span><span class="n-tag" id="known-tag"></span></div>
  </header>
  <p id="msg"></p>

  <section class="n-card study" id="study">
    <div class="bar"><i id="progress"></i></div>
    <div class="face" id="front"></div>
    <div class="face back" id="back" hidden></div>
    <button class="n-btn n-primary" id="show" hidden>Show answer</button>
    <div class="grades" id="grades" hidden>
      <button class="n-btn" data-grade="again">Again</button>
      <button class="n-btn" data-grade="good">Good</button>
      <button class="n-btn" data-grade="easy">Easy</button>
    </div>
    <p class="n-muted" id="done" hidden></p>
  </section>

  <details>
    <summary>Add cards</summary>
    <form id="add">
      <label class="n-field">Front <textarea name="front" rows="2" required></textarea></label>
      <label class="n-field">Back <textarea name="back" rows="2" required></textarea></label>
      <button class="n-btn n-primary">Add</button>
    </form>
    <label class="n-field" style="margin-top:16px">Many at once: one card per line, front and back separated by a tab or " | "
      <textarea id="bulk" rows="5"></textarea></label>
    <button class="n-btn" id="bulk-add">Add these</button>
  </details>

  <details>
    <summary>All cards (<span id="count">0</span>)</summary>
    <div class="n-scroll"><table><thead><tr><th>Front</th><th>Back</th><th>Box</th><th>Next</th><th></th></tr></thead><tbody id="list"></tbody></table></div>
    <div class="n-row"><button class="n-btn" id="csv">Show as CSV</button></div>
    <textarea id="csv-out" rows="6" readonly hidden></textarea>
  </details>
</main>
<script>
// ---- Change these ----------------------------------------------------------------------------
const TITLE = "Spanish: present tense";
const SEED = [
  ["hablar, yo", "hablo"],
  ["comer, nosotros", "comemos"],
  ["vivir, ellos", "viven"],
  ["tener, yo", "tengo"],
  ["ir, tú", "vas"],
];
const NEW_PER_DAY = 15;                    // new cards introduced a day
const BOX_DAYS = [0, 1, 3, 7, 14, 30, 60]; // days until a card in each box comes back (box 0: today)
// ---- The rest stays as it is -------------------------------------------------------------------

const DAY = 86400000;
const $ = (id) => document.getElementById(id);
const store = window.naget && window.naget.storage; // kept by the app; outside it, nothing is kept
const keyOf = (front, back) => front.trim() + "\n" + back.trim();
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const newCard = (front, back) => ({ key: keyOf(front, back), front: front.trim(), back: back.trim(), box: 0, due: 0, reviews: 0, lapses: 0, seen: 0 });

let cards = [];
let removed = [];
let queue = [];
let current = null;
let total = 0;

// The card after an answer.
function schedule(card, grade, now) {
  const c = { ...card, reviews: card.reviews + 1, seen: card.seen || now };
  if (grade === "again") {
    c.box = 0;
    c.due = now;
    c.lapses = card.lapses + 1;
  } else {
    c.box = Math.min(card.box + (grade === "easy" ? 2 : 1), BOX_DAYS.length - 1);
    c.due = startOfDay(now) + BOX_DAYS[c.box] * DAY;
  }
  return c;
}

// What to study now: cards due again (the longest waiting first), then new cards up to the day's limit.
function buildQueue(all, now) {
  const today = startOfDay(now);
  const due = all.filter((c) => c.reviews > 0 && c.due <= now).sort((a, b) => a.due - b.due);
  const left = Math.max(0, NEW_PER_DAY - all.filter((c) => c.seen >= today).length);
  return [...due, ...all.filter((c) => c.reviews === 0).slice(0, left)].map((c) => c.key);
}

async function save() {
  if (!store) return;
  try {
    await store.set("cards", cards);
    await store.set("removed", removed);
    $("msg").textContent = "";
  } catch (e) {
    $("msg").textContent = "Could not save: " + e.message;
  }
}

function when(t) {
  const days = Math.round((startOfDay(t) - startOfDay(Date.now())) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return new Date(t).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function counts() {
  const now = Date.now();
  $("due-tag").textContent = cards.filter((c) => c.reviews > 0 && c.due <= now).length + " due";
  $("new-tag").textContent = cards.filter((c) => c.reviews === 0).length + " new";
  $("known-tag").textContent = cards.filter((c) => c.box >= 3).length + " known well";
  $("count").textContent = cards.length;
}

function next() {
  if (!queue.length) {
    queue = buildQueue(cards, Date.now());
    total = queue.length;
  }
  current = cards.find((c) => c.key === queue[0]) || null;
  const has = !!current;
  $("front").hidden = !has;
  $("back").hidden = true;
  $("show").hidden = !has;
  $("grades").hidden = true;
  $("done").hidden = has;
  $("progress").style.width = (total ? Math.round(((total - queue.length) / total) * 100) : 100) + "%";
  if (has) {
    $("front").textContent = current.front;
    $("back").textContent = current.back;
  } else if (!cards.length) {
    $("done").textContent = "No cards yet: add some below.";
  } else {
    const later = cards.filter((c) => c.reviews > 0).map((c) => c.due).sort((a, b) => a - b)[0];
    $("done").textContent = "Done for now." + (later ? " The next card is due " + when(later) + "." : "");
  }
  counts();
}

function reveal() {
  if (!current || !$("grades").hidden) return;
  $("back").hidden = false;
  $("show").hidden = true;
  $("grades").hidden = false;
}

async function answer(grade) {
  if (!current || $("grades").hidden) return;
  const updated = schedule(current, grade, Date.now());
  cards = cards.map((c) => (c.key === updated.key ? updated : c));
  queue.shift();
  if (grade === "again") queue.push(updated.key);
  next();
  renderList();
  await save();
}

function addCards(pairs) {
  let added = 0;
  for (const [front, back] of pairs) {
    if (!front.trim() || !back.trim()) continue;
    const key = keyOf(front, back);
    if (cards.some((c) => c.key === key)) continue;
    cards.push(newCard(front, back));
    removed = removed.filter((k) => k !== key);
    added++;
  }
  return added;
}

function renderList() {
  const body = $("list");
  body.textContent = "";
  for (const c of cards) {
    const tr = document.createElement("tr");
    for (const v of [c.front, c.back, String(c.box), c.reviews ? when(c.due) : "new"]) {
      const td = document.createElement("td");
      td.textContent = v;
      tr.append(td);
    }
    const td = document.createElement("td");
    const del = document.createElement("button");
    del.className = "n-btn";
    del.textContent = "Delete";
    del.onclick = async () => {
      cards = cards.filter((x) => x.key !== c.key);
      removed.push(c.key);
      queue = queue.filter((k) => k !== c.key);
      renderList();
      next();
      await save();
    };
    td.append(del);
    tr.append(td);
    body.append(tr);
  }
  counts();
}

async function init() {
  document.title = TITLE;
  $("title").textContent = TITLE;
  let saved = null;
  try {
    saved = store ? await store.get("cards") : null;
    removed = (store && (await store.get("removed"))) || [];
  } catch (e) {
    $("msg").textContent = "Could not load saved cards: " + e.message;
  }
  cards = Array.isArray(saved) ? saved : [];
  // Cards in SEED that are not here yet (and were not deleted) join as new cards.
  const fresh = SEED.filter(([f, b]) => !removed.includes(keyOf(f, b)));
  if (addCards(fresh) || !Array.isArray(saved)) await save();
  renderList();
  next();
}

$("show").onclick = reveal;
$("grades").onclick = (e) => { const g = e.target.closest("[data-grade]"); if (g) answer(g.dataset.grade); };
document.addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("textarea, input")) return;
  if (e.key === " " || e.key === "Enter") { e.preventDefault(); reveal(); }
  else if (e.key === "1") answer("again");
  else if (e.key === "2") answer("good");
  else if (e.key === "3") answer("easy");
});
$("add").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  if (addCards([[f.front.value, f.back.value]])) { f.reset(); queue = []; renderList(); next(); await save(); }
};
$("bulk-add").onclick = async () => {
  const pairs = $("bulk").value.split("\n").map((line) => {
    const sep = line.includes("\t") ? "\t" : " | ";
    const cut = line.split(sep);
    return [cut[0] || "", cut.slice(1).join(sep)];
  });
  const n = addCards(pairs);
  $("msg").textContent = n ? "" : "No new cards found: put a tab or \" | \" between front and back.";
  if (n) { $("bulk").value = ""; queue = []; renderList(); next(); await save(); }
};
$("csv").onclick = () => {
  const q = (s) => '"' + s.replace(/"/g, '""') + '"';
  const out = $("csv-out");
  out.value = cards.map((c) => q(c.front) + "," + q(c.back)).join("\n");
  out.hidden = false;
  out.select();
};
init();
</script>
</body>
</html>
```

The person can copy the CSV from the box that **Show as CSV** opens (Anki imports it as two fields).
An agent can also read the stored cards with `get_page` and write a CSV file to hand over.
