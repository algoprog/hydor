# The preview page

Tested in Chrome, at a computer's width and a phone's. Each candidate appears beside its title among
real videos on the same topic: second in a computer's home feed (360 px wide), third in the up-next
list beside a video (168 px), second on a phone (a 360 px column, or the screen's width). Buttons
switch between the candidates and between YouTube's dark and light looks; titles are cut to two
lines and the length sits in the bottom-right corner, as on YouTube. The "Choose" buttons put
"Thumbnail: A" into the person's message box. The page keeps YouTube's colours, not the app's.

What to fill in, at the top of the script:

- `CHANNEL`: the person's channel name, and the views and age a new video of theirs might show.
- `CANDIDATES`: for each, the title it goes with, the video's length, and `img`: the line printed by
  the base64 command in `references/make-the-file.md` (a 320-pixel copy, about 28,000 characters).
- `NEIGHBOURS`: four real videos the same viewers would see. Find them with `web_search` (`sites:
  ["youtube.com"]`, the video's topic); `id` is the 11 characters after `watch?v=` in the link, and
  the page loads that video's thumbnail from YouTube. Copy the title and channel as they are; views,
  age and length can be rough. Without an id, a grey box stands in.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Thumbnail preview</title>
<style>
  .yt { --bg: #0f0f0f; --fg: #f1f1f1; --muted: #aaaaaa; --line: #303030; --chip: #272727;
        background: var(--bg); color: var(--fg); font-family: Roboto, Arial, sans-serif;
        padding: 16px; border-radius: 12px; }
  .yt.light { --bg: #ffffff; --fg: #0f0f0f; --muted: #606060; --line: #e5e5e5; --chip: #f2f2f2; }
  .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .bar span { color: var(--muted); font-size: 14px; margin-right: 4px; }
  .bar button { font: 500 14px Roboto, Arial, sans-serif; border: 0; border-radius: 8px;
                padding: 6px 12px; background: var(--chip); color: var(--fg); cursor: pointer; }
  .bar button.on { background: var(--fg); color: var(--bg); }
  h2 { font: 500 15px Roboto, Arial, sans-serif; color: var(--muted); margin: 22px 0 10px; }
  .thumb { position: relative; display: block; aspect-ratio: 16 / 9; border-radius: 12px;
           overflow: hidden; background: #3f3f3f; }
  .thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .len { position: absolute; right: 6px; bottom: 6px; padding: 1px 4px; border-radius: 4px;
         background: rgba(0, 0, 0, .8); color: #fff; font: 500 12px/18px Roboto, Arial, sans-serif; }
  .title { margin: 0; font-weight: 500; overflow: hidden; display: -webkit-box;
           -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .meta { margin: 0; color: var(--muted); }
  .row { display: flex; gap: 12px; }
  .avatar { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center;
            color: #fff; font: 500 15px Roboto, Arial, sans-serif; }
  .feed { display: flex; flex-wrap: wrap; gap: 32px 16px; }
  .feed .card { width: 360px; max-width: 100%; }
  .feed .row { margin-top: 12px; }
  .feed .title { font-size: 16px; line-height: 22px; }
  .feed .meta { font-size: 14px; line-height: 20px; }
  .views { display: flex; flex-wrap: wrap; gap: 8px 32px; align-items: flex-start; }
  .side { display: grid; gap: 8px; width: 402px; max-width: 100%; }
  .side .row { gap: 8px; }
  .side .thumb { flex: none; width: 168px; border-radius: 8px; }
  .side .title { font-size: 14px; line-height: 20px; }
  .side .meta { font-size: 12px; line-height: 18px; }
  .phone { width: 360px; max-width: 100%; border: 1px solid var(--line); border-radius: 16px; overflow: hidden; }
  .phone .thumb { border-radius: 0; }
  .phone .row { padding: 10px 12px 18px; }
  .phone .title { font-size: 14px; line-height: 20px; }
  .phone .meta { font-size: 12px; line-height: 18px; }
  .pick { margin-top: 22px; }
</style>
</head>
<body class="n-page">
<div class="yt" id="yt">
  <div class="bar" id="show"></div>
  <h2>Home feed on a computer</h2>
  <div class="feed" id="feed"></div>
  <div class="views">
    <div><h2>Up next, beside a video</h2><div class="side" id="side"></div></div>
    <div><h2>Phone</h2><div class="phone" id="phone"></div></div>
  </div>
  <div class="bar pick" id="pick"></div>
</div>
<script>
// ---- Change these ---------------------------------------------------------------------------------
const CHANNEL = { name: "Your channel", views: "1.2K views", age: "1 day ago" };
// Each candidate: its title, the video's length, and a small copy (320 px wide JPEG) as base64.
const CANDIDATES = [
  { id: "A", title: "The title that goes with thumbnail A", length: "12:04", img: "data:image/jpeg;base64,PASTE" },
  { id: "B", title: "The title that goes with thumbnail B", length: "12:04", img: "data:image/jpeg;base64,PASTE" },
];
// Real videos the same viewers would see next to it: the id is the part after watch?v= in the link.
const NEIGHBOURS = [
  { title: "A real video's title", channel: "Its channel", views: "48K views", age: "3 weeks ago", length: "9:41", id: "VIDEO_ID" },
  { title: "Another real video's title", channel: "Another channel", views: "310K views", age: "2 months ago", length: "15:22", id: "VIDEO_ID" },
  { title: "A third one", channel: "A third channel", views: "7.9K views", age: "5 days ago", length: "6:03", id: "VIDEO_ID" },
  { title: "A fourth one", channel: "A fourth channel", views: "1M views", age: "1 year ago", length: "21:47", id: "VIDEO_ID" },
];
// ---- The rest stays as it is ----------------------------------------------------------------------
let shown = CANDIDATES[0].id;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

function video(v, mine) {
  return mine
    ? { title: v.title, channel: CHANNEL.name, meta: CHANNEL.views + " • " + CHANNEL.age, length: v.length, img: v.img }
    : { title: v.title, channel: v.channel, meta: v.views + " • " + v.age, length: v.length,
        img: /^[\w-]{11}$/.test(v.id || "") ? "https://i.ytimg.com/vi/" + v.id + "/mqdefault.jpg" : "" };
}
function thumb(v) {
  const t = el("div", "thumb");
  if (v.img) { const i = el("img"); i.src = v.img; i.alt = ""; t.append(i); }
  t.append(el("span", "len", v.length));
  return t;
}
function avatar(name) {
  const a = el("div", "avatar", (name.trim()[0] || "?").toUpperCase());
  a.style.background = "hsl(" + hue(name) + " 45% 42%)";
  return a;
}
function card(v) {          // home feed and phone: the picture on top, then avatar, title, channel
  const c = el("div", "card");
  const text = el("div");
  text.append(el("p", "title", v.title), el("p", "meta", v.channel), el("p", "meta", v.meta));
  const row = el("div", "row");
  row.append(avatar(v.channel), text);
  c.append(thumb(v), row);
  return c;
}
function item(v) {          // up next: a small picture, the title beside it
  const r = el("div", "row");
  const text = el("div");
  text.append(el("p", "title", v.title), el("p", "meta", v.channel), el("p", "meta", v.meta));
  r.append(thumb(v), text);
  return r;
}
function render() {
  const mine = video(CANDIDATES.find((c) => c.id === shown), true);
  const n = NEIGHBOURS.map((v) => video(v, false));
  const fill = (id, list, make) => { const box = document.getElementById(id); box.textContent = ""; list.forEach((v) => v && box.append(make(v))); };
  fill("feed", [n[0], mine, n[1], n[2]], card);           // never first: it has to win among others
  fill("side", [n[1], n[0], mine, n[2], n[3]], item);
  fill("phone", [n[2], mine, n[3]], card);
  for (const b of document.querySelectorAll("#show button")) b.classList.toggle("on", b.dataset.k === shown || b.dataset.k === theme());
}
const theme = () => (document.getElementById("yt").classList.contains("light") ? "light" : "dark");
function buttons() {
  const show = document.getElementById("show");
  show.append(el("span", "", "Show"));
  for (const c of CANDIDATES) {
    const b = el("button", "", c.id);
    b.dataset.k = c.id;
    b.onclick = () => { shown = c.id; render(); };
    show.append(b);
  }
  show.append(el("span", "", " YouTube in"));
  for (const t of ["dark", "light"]) {
    const b = el("button", "", t === "dark" ? "Dark" : "Light");
    b.dataset.k = t;
    b.onclick = () => { document.getElementById("yt").classList.toggle("light", t === "light"); render(); };
    show.append(b);
  }
  const pick = document.getElementById("pick");
  pick.append(el("span", "", "Choose"));
  for (const c of CANDIDATES) {
    const b = el("button", "", "Thumbnail " + c.id);
    b.dataset.choice = c.id;           // the message box gets "Thumbnail: A"
    b.dataset.group = "Thumbnail";
    pick.append(b);
  }
}
buttons();
render();
</script>
</body>
</html>
```

As a file instead (many candidates, or no base64): put each candidate's file name in `img`
(`"thumb-a.jpg"`), save the page beside the thumbnails, and look at it with `ui_screenshot` (phase
`check`, viewport `both`, `full_page` true).
