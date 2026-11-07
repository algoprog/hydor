// More ready-made apps, for everyday things: the weather where you are going, a team's matches, what to cook and
// eat this week, gifts, what to watch, games and a quiz to play, what is on in a city, plans for training, saving and
// studying, charts of your own numbers and of countries, markets, a topic as a timeline, a place on a map, books.
// Each is small and quick: it asks a few things, gets real data where a free service has it (Open-Meteo, TheSportsDB,
// TheMealDB, TVmaze, CheapShark, Open Library, Wikipedia, the World Bank, Frankfurter, CoinGecko, OpenStreetMap), lets
// a program do what must come out exact (dates, sums, scores, rankings, the shapes the charts draw), and asks a model
// only to read, pick and say it in plain words. No agent does their work unless a step fails. Their views (views-more.ts)
// show the answer as cards, charts, maps and timelines, and work on a phone too.
//
// The programs are JavaScript as the code steps show them: String.raw keeps their backslashes as written, so none of
// them uses a backtick or a template literal. The services that ask for it are told who is calling (User-Agent).
import type { AppTemplate } from '../../shared/apps.ts';

type Draft = Omit<AppTemplate, 'agent' | 'tools' | 'limits'>;

/** Who is calling, for the services that ask (OpenStreetMap, CheapShark, Wikipedia). */
const UA = 'Hydor (+https://github.com/algoprog/hydor)';
const HEADERS = { 'User-Agent': UA };

// ---- what the programs share ----------------------------------------------------------------------------------

/** A value as a list: as it is, from JSON an agent handed in, or from lines of text; rows: the objects in it. */
const LIST = String.raw`function list(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && /^\s*\[/.test(v)) {
    try {
      const x = JSON.parse(v);
      if (Array.isArray(x)) return x;
    } catch (e) {}
  }
  if (typeof v === 'string') return v.split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  return [];
}
function rows(v) {
  return list(v).filter((x) => x && typeof x === 'object' && !Array.isArray(x));
}
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.\-]/g, ''));
  return isFinite(n) ? n : null;
}
`;

/** The JSON an address answered with, from what http_request gives (its status and headers, a blank line, the body). */
const BODY = String.raw`// The JSON an address answered with: http_request gives its status and headers, a blank line, then the body. An
// answer cut short (a long list) keeps the items that came whole.
function bodyOf(r) {
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    if (r.data && typeof r.data === 'object') return r.data;
    if (!('text' in r)) return Object.keys(r).length ? r : null;
  }
  let t = String(r && typeof r === 'object' ? r.text || '' : r || '');
  if (/^HTTP \d/.test(t)) {
    const at = t.indexOf('\n\n');
    t = at >= 0 ? t.slice(at + 2) : '';
  }
  t = t.replace(/\n(?:… \(cut at [\d,]+ characters of [\d,]+\)|\(The answer was longer than [^)]*\))\s*$/, '').trim();
  if (!/^[[{]/.test(t)) return null;
  try {
    return JSON.parse(t);
  } catch (e) {}
  const open = [];
  let str = false;
  let esc = false;
  let cut = -1;
  let close = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (str) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') str = false;
    } else if (c === '"') str = true;
    else if (c === '{') open.push('}');
    else if (c === '[') open.push(']');
    else if (c === '}' || c === ']') open.pop();
    else if (c === ',' && open.length) {
      cut = i;
      close = open.slice().reverse().join('');
    }
  }
  if (cut < 0) return null;
  try {
    return JSON.parse(t.slice(0, cut) + close);
  } catch (e) {
    return null;
  }
}
`;

/** The place a name stands for: Open-Meteo's search first (English names), then OpenStreetMap's (any language, any kind of place). */
const PLACE = String.raw`// The place a search found that fits what was asked best: one in the region or country named after a comma ("Paris,
// Texas"), then one of exactly that name, then the most populous. When it finds none (a name in another language, a
// coast, a district), OpenStreetMap's search is asked instead.
async function placeOf(found, asked, ctx) {
  const results = ((bodyOf(found) || {}).results || []).filter((p) => isFinite(Number(p.latitude)) && isFinite(Number(p.longitude)));
  const plain = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const name = plain(String(asked || '').split(',')[0]);
  const words = plain(String(asked || '').split(',').slice(1).join(' ')).split(/\s+/).filter((w) => w.length > 1);
  if (results.length) {
    const score = (p) => words.filter((w) => plain([p.admin1, p.admin2, p.country, p.country_code].join(' ')).includes(w)).length * 1e12 + (plain(p.name) === name ? 1e11 : 0) + (Number(p.population) || 0);
    const p = results.slice().sort((a, b) => score(b) - score(a))[0];
    const twins = results.filter((q) => plain(q.name) === plain(p.name)).length > 1;
    const region = twins && p.admin1 && !plain(p.admin1).includes(plain(p.name)) ? p.admin1 : '';
    // An island's point is its middle, often high up: its weather is worked out for the coast instead.
    return { name: p.name, label: [p.name, region, p.country].filter(Boolean).join(', '), lat: Number(p.latitude), lng: Number(p.longitude), country: p.country || '', coast: /^ISLS?$/.test(String(p.feature_code || '')) };
  }
  try {
    const r = await ctx.tool('http_request', { url: 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&q=' + encodeURIComponent(String(asked || '')), headers: { 'User-Agent': '${UA}' } }, { title: 'Look it up on OpenStreetMap' });
    const hit = (bodyOf(r) || [])[0];
    if (hit && isFinite(Number(hit.lat))) {
      const parts = String(hit.display_name || '').split(', ');
      return { name: hit.name || parts[0] || String(asked), label: [parts[0], parts.length > 2 ? parts[parts.length - 1] : ''].filter(Boolean).join(', '), lat: Number(hit.lat), lng: Number(hit.lon), country: parts.length > 1 ? parts[parts.length - 1] : '', coast: hit.type === 'island' };
    }
  } catch (e) {}
  return null;
}
`;

/** The weather codes Open-Meteo gives (WMO), in words and as a picture. */
const SKY = String.raw`const SKY = {
  0: ['Clear', '☀️'], 1: ['Mostly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'], 45: ['Fog', '🌫️'], 48: ['Freezing fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'], 56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'], 66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '🌨️'], 80: ['Light showers', '🌦️'], 81: ['Showers', '🌧️'],
  82: ['Heavy showers', '⛈️'], 85: ['Snow showers', '🌨️'], 86: ['Heavy snow showers', '❄️'], 95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm with hail', '⛈️'], 99: ['Thunderstorm with hail', '⛈️'],
};
`;

/** A search's results as the programs read them (the JSON a search gave, or the numbered list it wrote). */
const HITS = String.raw`function hitsOf(r) {
  if (!r) return [];
  const ok = (h) => /^https?:\/\//.test(h.url);
  if (r.data && Array.isArray(r.data.results))
    return r.data.results.map((h, i) => ({ title: String(h.title || ''), url: String(h.url || ''), date: String(h.date || ''), snippet: String(h.snippet || h.description || ''), rank: i + 1 })).filter(ok);
  const out = [];
  let cur = null;
  for (const line of String(r.text || '').split('\n')) {
    const head = /^\[(\d+)\] (.*)$/.exec(line);
    if (head) {
      cur = { title: head[2].trim(), url: '', date: '', snippet: '', rank: Number(head[1]) };
      out.push(cur);
    } else if (!line.trim()) continue;
    else if (!cur || !/^\s/.test(line)) cur = null;
    else if (!cur.url) {
      const m = /^(\S+)(?: \((.*)\))?$/.exec(line.trim());
      cur.url = m ? m[1] : line.trim();
      for (const part of (m && m[2] ? m[2] : '').split(', ')) if (/^\d{4}(-\d{2}){0,2}$/.test(part)) cur.date = part;
    } else cur.snippet += (cur.snippet ? ' ' : '') + line.trim();
  }
  return out.filter(ok);
}
function siteOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}
`;

// ---- the apps --------------------------------------------------------------------------------------------------

// ---- sports ---------------------------------------------------------------------------------------------------

/** TheSportsDB's free key, for anyone to use (30 calls a minute). */
const SPORTSDB = 'https://www.thesportsdb.com/api/v1/json/123';

const RESULT_COLS = [
  { id: 'date', label: 'Date', type: 'date' as const },
  { id: 'opponent', label: 'Opponent', type: 'text' as const },
  { id: 'venue', label: 'Home or away', type: 'text' as const },
  { id: 'competition', label: 'Competition', type: 'text' as const },
  { id: 'score', label: 'Score', type: 'text' as const },
  { id: 'result', label: 'Result', type: 'text' as const, description: 'W, D or L' },
  { id: 'scored', label: 'Scored', type: 'number' as const },
  { id: 'conceded', label: 'Conceded', type: 'number' as const },
];
const FIXTURE_COLS = [
  { id: 'date', label: 'Date', type: 'date' as const },
  { id: 'time', label: 'Time', type: 'text' as const },
  { id: 'opponent', label: 'Opponent', type: 'text' as const },
  { id: 'venue', label: 'Home or away', type: 'text' as const },
  { id: 'competition', label: 'Competition', type: 'text' as const },
  { id: 'days', label: 'Days from today', type: 'number' as const },
];
const NEWS_COLS = [
  { id: 'title', label: 'Story', type: 'text' as const },
  { id: 'source', label: 'Source', type: 'text' as const },
  { id: 'date', label: 'Date', type: 'text' as const },
  { id: 'gist', label: 'In a sentence', type: 'text' as const },
  { id: 'url', label: 'Link', type: 'url' as const },
];
const MEETING_COLS = [
  { id: 'date', label: 'Date', type: 'text' as const },
  { id: 'home', label: 'Home', type: 'text' as const },
  { id: 'away', label: 'Away', type: 'text' as const },
  { id: 'score', label: 'Score', type: 'text' as const },
  { id: 'winner', label: 'Won', type: 'text' as const },
];

/** The team TheSportsDB knows by a name, in the sport or league asked for. */
const TEAM = String.raw`// The team TheSportsDB knows by that name, the one in the sport, league or country asked for when several are.
function teamOf(found, hint) {
  const teams = (bodyOf(found) || {}).teams || [];
  const words = String(hint || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
  const score = (t) => words.filter((w) => [t.strSport, t.strLeague, t.strLeague2, t.strCountry].filter(Boolean).join(' ').toLowerCase().includes(w)).length;
  return teams.slice().sort((a, b) => score(b) - score(a))[0] || null;
}
`;

// ---- food ------------------------------------------------------------------------------------------------------

/** TheMealDB with its free test key. */
const MEALDB = 'https://www.themealdb.com/api/json/v1/1';

/** Ingredients as the recipes name them, matched to what someone has; what a diet leaves out; the basics in every cupboard. */
const KITCHEN = String.raw`// Ingredients as words to compare: small letters, no accents, quantities and words like "fresh" left out, plurals as one.
const QUIET = new Set(['a', 'an', 'some', 'of', 'the', 'fresh', 'frozen', 'leftover', 'leftovers', 'cooked', 'raw', 'dried', 'chopped', 'sliced', 'large', 'small', 'big', 'ripe', 'half', 'whole', 'can', 'cans', 'tin', 'tins', 'jar', 'bag', 'bunch', 'pack', 'packet', 'few', 'couple', 'g', 'kg', 'ml', 'l', 'lb', 'lbs', 'oz', 'cup', 'cups', 'tbsp', 'tsp', 'piece', 'pieces']);
const stem = (w) => (w.length > 3 ? w.replace(/ies$/, 'y').replace(/(o|ch|sh|ss|x)es$/, '$1').replace(/([^s])s$/, '$1') : w);
const words = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1 && !QUIET.has(w))
    .map(stem);
// One thing matches another when all the words of one are in the other ("chicken" and "chicken breasts").
const matches = (a, b) => {
  const x = words(a);
  const y = words(b);
  return !!x.length && !!y.length && (x.every((w) => y.includes(w)) || y.every((w) => x.includes(w)));
};
const STAPLE = /^(salt|sea salt|table salt|pepper|black pepper|white pepper|ground pepper|oil|olive oil|extra virgin olive oil|vegetable oil|sunflower oil|canola oil|rapeseed oil|water|cold water|hot water|boiling water|ice|sugar|caster sugar|granulated sugar|brown sugar|flour|plain flour|paprika|smoked paprika|cumin|ground cumin|cumin seeds|oregano|dried oregano|thyme|dried thyme|cinnamon|ground cinnamon|chilli powder|chili powder|chilli flakes|red pepper flakes|cayenne pepper|turmeric|ground turmeric|ground coriander|coriander seeds|garam masala|curry powder|bay leaf|bay leaves|nutmeg|mixed herbs|vinegar|white wine vinegar|stock cube|stock|vegetable stock|chicken stock)$/;
const isStaple = (s) => STAPLE.test(String(s || '').toLowerCase().trim());
const MEAT = /\b(chicken|beef|pork|lamb|mutton|goat|veal|bacon|ham|prosciutto|pancetta|salami|chorizo|sausages?|mince|turkey|duck|venison|steak|brisket|ribs?|liver|kidney|gammon)\b/i;
const FISH = /\b(fish|salmon|tuna|cod|haddock|mackerel|sardines?|anchov(y|ies)|prawns?|shrimps?|crab|lobster|mussels|clams|squid|octopus|scallops?|trout|sea bass|monkfish|tilapia|fish sauce|oyster sauce)\b/i;
const ANIMAL = /\b(eggs?|milk|cheese|butter|cream|yogh?urt|honey|ghee|mayonnaise|parmesan|mozzarella|cheddar|feta|ricotta|gelatine)\b/i;
const PORK = /\b(pork|bacon|ham|prosciutto|pancetta|salami|chorizo|sausages?|gammon|lard)\b/i;
const GLUTEN = /\b(flour|bread|breadcrumbs|pasta|spaghetti|penne|fusilli|linguine|tagliatelle|lasagne|macaroni|noodles|couscous|bulgur|barley|semolina|wheat|tortillas?|pitta|pita|naan|soy sauce|beer|biscuits?|cake|pastry|puff pastry|filo)\b/i;
// Whether a recipe (its category and ingredients) suits a diet.
function suits(diet, category, items) {
  const all = items.join(' | ');
  const cat = String(category || '');
  if (diet === 'Vegetarian') return !/^(Beef|Chicken|Lamb|Pork|Seafood|Goat)$/.test(cat) && !MEAT.test(all) && !FISH.test(all);
  if (diet === 'Vegan') return !/^(Beef|Chicken|Lamb|Pork|Seafood|Goat)$/.test(cat) && !MEAT.test(all) && !FISH.test(all) && !ANIMAL.test(all);
  if (diet === 'Pescatarian') return !/^(Beef|Chicken|Lamb|Pork|Goat)$/.test(cat) && !MEAT.test(all);
  if (diet === 'No pork') return cat !== 'Pork' && !PORK.test(all);
  if (diet === 'Gluten-free') return !GLUTEN.test(all);
  return true;
}
// A recipe's ingredients with their amounts, as TheMealDB lists them.
function ingredientsOf(m) {
  const out = [];
  for (let i = 1; i <= 20; i++) {
    const item = String(m['strIngredient' + i] || '').trim();
    if (item) out.push({ item, amount: String(m['strMeasure' + i] || '').trim() });
  }
  return out;
}
const linkOf = (v) => (/^https?:\/\/\S+$/.test(String(v || '').trim()) ? String(v).trim() : null);
`;

const RECIPE_COLS = [
  { id: 'name', label: 'Recipe', type: 'text' as const },
  { id: 'picture', label: 'Picture', type: 'image' as const },
  { id: 'area', label: 'Cuisine', type: 'text' as const },
  { id: 'minutes', label: 'Minutes', type: 'number' as const },
  { id: 'difficulty', label: 'How hard', type: 'text' as const },
  { id: 'uses', label: 'Uses of yours', type: 'number' as const },
  { id: 'missing', label: 'Missing', type: 'number' as const },
  { id: 'uses_list', label: 'What it uses of yours', type: 'text' as const },
  { id: 'missing_list', label: 'What you would need', type: 'text' as const },
  { id: 'fits', label: 'Fits your time', type: 'yesno' as const },
  { id: 'video', label: 'Video', type: 'url' as const },
  { id: 'link', label: 'Recipe page', type: 'url' as const },
];
const STEP_COLS = [
  { id: 'recipe', label: 'Recipe', type: 'text' as const },
  { id: 'n', label: 'Step', type: 'number' as const },
  { id: 'step', label: 'What to do', type: 'text' as const },
  { id: 'minutes', label: 'Minutes', type: 'number' as const },
];
const INGREDIENT_COLS = [
  { id: 'recipe', label: 'Recipe', type: 'text' as const },
  { id: 'item', label: 'Ingredient', type: 'text' as const },
  { id: 'amount', label: 'Amount', type: 'text' as const },
  { id: 'have', label: 'You have it', type: 'yesno' as const },
];
const DINNER_COLS = [
  { id: 'day', label: 'Day', type: 'number' as const },
  { id: 'date', label: 'Date', type: 'date' as const },
  { id: 'meal', label: 'Dinner', type: 'text' as const },
  { id: 'picture', label: 'Picture', type: 'image' as const },
  { id: 'area', label: 'Cuisine', type: 'text' as const },
  { id: 'category', label: 'Kind', type: 'text' as const },
  { id: 'why', label: 'Why', type: 'text' as const },
  { id: 'ingredients', label: 'Ingredients', type: 'text' as const },
  { id: 'method', label: 'Method', type: 'text' as const },
  { id: 'video', label: 'Video', type: 'url' as const },
  { id: 'link', label: 'Recipe page', type: 'url' as const },
];
const SHOP_COLS = [
  { id: 'item', label: 'Item', type: 'text' as const },
  { id: 'amount', label: 'How much', type: 'text' as const },
  { id: 'aisle', label: 'Aisle', type: 'text' as const },
  { id: 'meals', label: 'For', type: 'text' as const },
  { id: 'staple', label: 'Probably in the cupboard', type: 'yesno' as const },
];

// ---- shopping, films and games, plans, charts, timelines, places, books ---------------------------------------------

const GIFT_COLS = [
  { id: 'idea', label: 'Idea', type: 'text' as const },
  { id: 'kind', label: 'Kind', type: 'text' as const },
  { id: 'why', label: 'Why it suits them', type: 'text' as const },
  { id: 'low', label: 'From', type: 'number' as const },
  { id: 'high', label: 'To', type: 'number' as const },
  { id: 'example', label: 'One to buy', type: 'text' as const },
  { id: 'price', label: 'Its price', type: 'number' as const },
  { id: 'shop', label: 'Shop', type: 'text' as const },
  { id: 'link', label: 'Link', type: 'url' as const },
  { id: 'fits', label: 'Within the budget', type: 'yesno' as const },
  { id: 'picture', label: 'Picture', type: 'image' as const },
];
const WATCH_COLS = [
  { id: 'title', label: 'Title', type: 'text' as const },
  { id: 'year', label: 'Year', type: 'number' as const },
  { id: 'kind', label: 'Film or show', type: 'text' as const },
  { id: 'genre', label: 'Genre', type: 'text' as const },
  { id: 'minutes', label: 'Minutes', type: 'number' as const },
  { id: 'rating', label: 'Rating', type: 'number' as const },
  { id: 'where', label: 'Where to watch', type: 'text' as const },
  { id: 'on_yours', label: 'On your services', type: 'yesno' as const },
  { id: 'why', label: 'Why', type: 'text' as const },
  { id: 'picture', label: 'Picture', type: 'image' as const },
  { id: 'video', label: 'Trailer', type: 'url' as const },
  { id: 'link', label: 'More about it', type: 'url' as const },
];
const GAME_COLS = [
  { id: 'title', label: 'Game', type: 'text' as const },
  { id: 'year', label: 'Year', type: 'number' as const },
  { id: 'out', label: 'Comes out', type: 'text' as const },
  { id: 'coming', label: 'Coming soon', type: 'yesno' as const },
  { id: 'genre', label: 'Genre', type: 'text' as const },
  { id: 'platforms', label: 'Plays on', type: 'text' as const },
  { id: 'hours', label: 'Hours to finish', type: 'number' as const },
  { id: 'why', label: 'Why', type: 'text' as const },
  { id: 'free', label: 'Free to play', type: 'yesno' as const },
  { id: 'price', label: 'Best price now, $', type: 'number' as const },
  { id: 'lowest', label: 'Lowest ever, $', type: 'number' as const },
  { id: 'store', label: 'Store', type: 'text' as const },
  { id: 'deal', label: 'Deal', type: 'url' as const },
  { id: 'picture', label: 'Picture', type: 'image' as const },
  { id: 'video', label: 'Trailer', type: 'url' as const },
];
const QUESTION_COLS = [
  { id: 'n', label: 'Number', type: 'number' as const },
  { id: 'question', label: 'Question', type: 'text' as const },
  { id: 'a', label: 'A', type: 'text' as const },
  { id: 'b', label: 'B', type: 'text' as const },
  { id: 'c', label: 'C', type: 'text' as const },
  { id: 'd', label: 'D', type: 'text' as const },
  { id: 'answer', label: 'Right answer', type: 'text' as const, description: 'A, B, C or D' },
  { id: 'explain', label: 'Why', type: 'text' as const },
];
const EVENT_COLS = [
  { id: 'name', label: 'What', type: 'text' as const },
  { id: 'date', label: 'Date', type: 'date' as const },
  { id: 'time', label: 'Time', type: 'text' as const },
  { id: 'venue', label: 'Where', type: 'text' as const },
  { id: 'kind', label: 'Kind', type: 'text' as const },
  { id: 'price', label: 'Price', type: 'text' as const },
  { id: 'why', label: 'Why go', type: 'text' as const },
  { id: 'url', label: 'Link', type: 'url' as const },
  { id: 'lat', label: 'Latitude', type: 'number' as const },
  { id: 'lng', label: 'Longitude', type: 'number' as const },
  { id: 'picture', label: 'Picture', type: 'image' as const },
];
const SAVING_COLS = [
  { id: 'month', label: 'Month', type: 'text' as const },
  { id: 'put_in', label: 'Put in so far', type: 'number' as const },
  { id: 'interest', label: 'Interest so far', type: 'number' as const },
  { id: 'balance', label: 'Balance', type: 'number' as const },
  { id: 'needed', label: 'On track for the goal', type: 'number' as const },
];
const TIMELINE_COLS = [
  { id: 'year', label: 'Year', type: 'number' as const, description: 'Negative before the common era' },
  { id: 'date', label: 'When', type: 'text' as const },
  { id: 'title', label: 'What happened', type: 'text' as const },
  { id: 'what', label: 'In a few sentences', type: 'text' as const },
  { id: 'kind', label: 'Kind', type: 'text' as const },
  { id: 'importance', label: 'How much it matters (1 to 3)', type: 'number' as const },
];
const PLACE_COLS = [
  { id: 'n', label: 'Stop', type: 'number' as const },
  { id: 'name', label: 'Place', type: 'text' as const },
  { id: 'kind', label: 'Kind', type: 'text' as const },
  { id: 'about', label: 'What it is', type: 'text' as const },
  { id: 'why', label: 'Why go', type: 'text' as const },
  { id: 'km', label: 'Km from the centre', type: 'number' as const },
  { id: 'lat', label: 'Latitude', type: 'number' as const },
  { id: 'lng', label: 'Longitude', type: 'number' as const },
  { id: 'picture', label: 'Picture', type: 'image' as const },
  { id: 'link', label: 'More about it', type: 'url' as const },
  { id: 'pick', label: 'A pick for you', type: 'yesno' as const },
];
const BOOK_COLS = [
  { id: 'title', label: 'Book', type: 'text' as const },
  { id: 'author', label: 'Author', type: 'text' as const },
  { id: 'year', label: 'First published', type: 'number' as const },
  { id: 'pages', label: 'Pages', type: 'number' as const },
  { id: 'rating', label: 'Rating (out of 5)', type: 'number' as const },
  { id: 'genre', label: 'Kind', type: 'text' as const },
  { id: 'why', label: 'Why you may like it', type: 'text' as const },
  { id: 'cover', label: 'Cover', type: 'image' as const },
  { id: 'link', label: 'At Open Library', type: 'url' as const },
  { id: 'subjects', label: 'About', type: 'text' as const },
];

export const MORE: Draft[] = [
  // ---- the weather -----------------------------------------------------------------------------------------------
  {
    id: 'weather-outlook',
    name: 'Weather outlook',
    icon: 'cloud-sun',
    color: 'cyan',
    category: 'Weather',
    description: 'The days ahead anywhere: highs and lows, rain and wind on charts, the next 48 hours, the best days for what you plan, and what to wear.',
    fields: [
      { id: 'place', label: 'Where', type: 'text', required: true, placeholder: 'e.g. Lisbon, or Zermatt, Switzerland' },
      { id: 'days', label: 'How far ahead', type: 'choice', options: ['3 days', '7 days', '14 days'], default: '7 days' },
      { id: 'plans', label: 'What you’re planning', type: 'text', placeholder: 'e.g. A hike, a picnic, drying the washing' },
      { id: 'units', label: 'Units', type: 'choice', options: ['Celsius', 'Fahrenheit'], default: 'Celsius' },
    ],
    prompt: '',
    flow: {
      steps: [
        { id: 'search', title: 'Look the place up', do: 'tool', tool: 'http_request', with: { url: 'https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json&name={{place}}' }, failed: 'skip' },
        {
          id: 'spot',
          title: 'Pick the place',
          do: 'code',
          language: 'javascript',
          with: { found: '{{search}}', place: '{{place}}', days: '{{days}}', units: '{{units}}' },
          code:
            BODY +
            PLACE +
            String.raw`// The place, and the address of its forecast: the days asked for, the next 48 hours and the weather now, in the units asked for.
const p = await placeOf(input.found, input.place, ctx);
if (!p) throw new Error('No place called “' + input.place + '” was found: check its spelling, or add its country');
const days = Math.min(16, Math.max(1, parseInt(String(input.days || '7'), 10) || 7));
const us = input.units === 'Fahrenheit';
const url =
  'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lng + (p.coast ? '&elevation=0' : '') + '&timezone=auto&forecast_days=' + days + '&forecast_hours=48' +
  '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m' +
  '&hourly=temperature_2m,precipitation_probability,weather_code' +
  '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max,sunrise,sunset' +
  (us ? '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch' : '');
return { label: p.label, lat: p.lat, lng: p.lng, at: p.lat + ',' + p.lng, url };`,
          outputs: [
            { id: 'label', label: 'Place', type: 'text' },
            { id: 'lat', label: 'Latitude', type: 'number' },
            { id: 'lng', label: 'Longitude', type: 'number' },
            { id: 'at', label: 'Where on a map', type: 'text' },
            { id: 'url', label: 'Its forecast', type: 'url' },
          ],
          failed: 'agent',
        },
        { id: 'forecast', title: 'Get the forecast', do: 'tool', tool: 'http_request', with: { url: '{{spot.url}}', max_chars: 200000 }, failed: 'agent' },
        {
          id: 'shape',
          title: 'Lay out the days',
          do: 'code',
          language: 'javascript',
          with: { forecast: '{{forecast}}', units: '{{units}}' },
          code:
            BODY +
            SKY +
            String.raw`// Each day as the view shows it (its sky in words and as a picture, highs and lows, rain, wind, UV, sunrise and sunset)
// with a score for how good it is to be out (dry, mild and calm days highest), the next 48 hours, and the weather now.
const f = bodyOf(input.forecast);
if (!f || !f.daily || !Array.isArray(f.daily.time)) throw new Error('The forecast did not come back: try again in a minute');
const us = input.units === 'Fahrenheit';
const at = (a, i) => (Array.isArray(a) && a[i] !== null && a[i] !== undefined && isFinite(Number(a[i])) ? Number(a[i]) : null);
const one = (v) => (v === null ? null : Math.round(v * 10) / 10);
const d = f.daily;
const ideal = us ? 72 : 22;
const days = d.time.map((date, i) => {
  const code = at(d.weather_code, i);
  const w = SKY[code] || ['', '🌡️'];
  const high = one(at(d.temperature_2m_max, i));
  const rain = one(at(d.precipitation_sum, i));
  const chance = at(d.precipitation_probability_max, i);
  const wind = at(d.wind_speed_10m_max, i);
  let score = 10 - (chance || 0) / 15 - Math.min(4, (rain || 0) / (us ? 0.1 : 2.5)) - Math.abs((high === null ? ideal : high) - ideal) / (us ? 7 : 4) - Math.max(0, (wind || 0) - (us ? 18 : 30)) / (us ? 6 : 10);
  if (code !== null && code >= 95) score -= 3;
  return {
    date,
    icon: w[1],
    sky: w[0],
    high,
    low: one(at(d.temperature_2m_min, i)),
    rain,
    chance,
    wind: wind === null ? null : Math.round(wind),
    uv: one(at(d.uv_index_max, i)),
    sunrise: String((d.sunrise || [])[i] || '').slice(11, 16),
    sunset: String((d.sunset || [])[i] || '').slice(11, 16),
    score: Math.max(0, Math.round(score * 10) / 10),
  };
});
const h = f.hourly || {};
const hours = (h.time || []).map((t, i) => ({ time: String(t).replace('T', ' '), hour: String(t).slice(11, 16), temp: one(at(h.temperature_2m, i)), chance: at(h.precipitation_probability, i), icon: (SKY[at(h.weather_code, i)] || ['', ''])[1] }));
const c = f.current || {};
const now = SKY[c.weather_code] || ['', ''];
const best = days.slice().sort((a, b) => b.score - a.score)[0];
return {
  days,
  hours,
  now_temp: one(at([c.temperature_2m], 0)),
  feels: one(at([c.apparent_temperature], 0)),
  now_sky: now[0],
  now_icon: now[1],
  wind_now: at([c.wind_speed_10m], 0),
  humidity: at([c.relative_humidity_2m], 0),
  dry: days.filter((x) => (x.chance === null || x.chance < 30) && (x.rain || 0) < (us ? 0.04 : 1)).length,
  best_day: best ? best.date : null,
  unit: us ? '°F' : '°C',
  rain_unit: us ? 'in' : 'mm',
  wind_unit: us ? 'mph' : 'km/h',
};`,
          outputs: [
            {
              id: 'days',
              label: 'The days',
              type: 'table',
              columns: [
                { id: 'date', label: 'Date', type: 'date' },
                { id: 'icon', label: 'Sky', type: 'text' },
                { id: 'sky', label: 'In words', type: 'text' },
                { id: 'high', label: 'High', type: 'number' },
                { id: 'low', label: 'Low', type: 'number' },
                { id: 'rain', label: 'Rain', type: 'number' },
                { id: 'chance', label: 'Chance of rain, %', type: 'number' },
                { id: 'wind', label: 'Wind', type: 'number' },
                { id: 'uv', label: 'UV index', type: 'number' },
                { id: 'sunrise', label: 'Sunrise', type: 'text' },
                { id: 'sunset', label: 'Sunset', type: 'text' },
                { id: 'score', label: 'Good to be out (0 to 10)', type: 'number' },
              ],
            },
            { id: 'hours', label: 'The next 48 hours', type: 'table', columns: [{ id: 'time', label: 'Time', type: 'text' }, { id: 'hour', label: 'Hour', type: 'text' }, { id: 'temp', label: 'Temperature', type: 'number' }, { id: 'chance', label: 'Chance of rain, %', type: 'number' }, { id: 'icon', label: 'Sky', type: 'text' }] },
            { id: 'now_temp', label: 'Now', type: 'number' },
            { id: 'feels', label: 'Feels like', type: 'number' },
            { id: 'now_sky', label: 'The sky now', type: 'text' },
            { id: 'now_icon', label: 'The sky now, as a picture', type: 'text' },
            { id: 'wind_now', label: 'Wind now', type: 'number' },
            { id: 'humidity', label: 'Humidity, %', type: 'number' },
            { id: 'dry', label: 'Dry days', type: 'number' },
            { id: 'best_day', label: 'Best day to be out', type: 'date' },
            { id: 'unit', label: 'Temperature unit', type: 'text' },
            { id: 'rain_unit', label: 'Rain unit', type: 'text' },
            { id: 'wind_unit', label: 'Wind unit', type: 'text' },
          ],
          failed: 'agent',
        },
        {
          id: 'read',
          title: 'Say what it means',
          do: 'model',
          instructions: `Read this weather forecast for {{spot.label}} and say in plain words what to expect{{#plans}}, and when is best for this: {{plans}}{{/plans}}. Today is {{today}}. Temperatures in {{shape.unit}}, rain in {{shape.rain_unit}}, wind in {{shape.wind_unit}}; "score" is how good a day is to be out, from 0 to 10.

{{shape.days}}

- summary: the days ahead in two or three sentences: the trend, the best of it and the worst of it.
- best: the best days {{#plans}}for that{{/plans}}{{^plans}}to be out{{/plans}}, best first, at most three: each its date exactly as listed (YYYY-MM-DD) and why, in a few words.
- wear: what to wear or take, a few short items.
- alerts: what to watch out for (storms, heavy rain, strong wind, heat, frost, a high UV index), each with its day; none when there is nothing.`,
          outputs: [
            { id: 'summary', label: 'In short', type: 'markdown', required: true },
            { id: 'best', label: 'Best days', type: 'table', columns: [{ id: 'date', label: 'Date', type: 'date' }, { id: 'why', label: 'Why', type: 'text' }] },
            { id: 'wear', label: 'What to wear', type: 'list' },
            { id: 'alerts', label: 'Watch out for', type: 'list' },
          ],
        },
      ],
      outputs: {
        place: '{{spot.label}}',
        at: '{{spot.at}}',
        summary: '{{read.summary}}',
        now_temp: '{{shape.now_temp}}',
        feels: '{{shape.feels}}',
        now_sky: '{{shape.now_sky}}',
        now_icon: '{{shape.now_icon}}',
        days: '{{shape.days}}',
        hours: '{{shape.hours}}',
        best: '{{read.best}}',
        wear: '{{read.wear}}',
        alerts: '{{read.alerts}}',
        dry: '{{shape.dry}}',
        unit: '{{shape.unit}}',
        wind_unit: '{{shape.wind_unit}}',
        rain_unit: '{{shape.rain_unit}}',
      },
    },
    answer: [
      { id: 'place', label: 'Place', type: 'text', required: true },
      { id: 'at', label: 'Where on a map', type: 'text', description: 'Its latitude and longitude, as "38.72,-9.14"' },
      { id: 'summary', label: 'In short', type: 'markdown', required: true },
      { id: 'now_temp', label: 'Now', type: 'number' },
      { id: 'feels', label: 'Feels like', type: 'number' },
      { id: 'now_sky', label: 'The sky now', type: 'text' },
      { id: 'now_icon', label: 'The sky now, as a picture', type: 'text' },
      {
        id: 'days',
        label: 'The days',
        type: 'table',
        required: true,
        columns: [
          { id: 'date', label: 'Date', type: 'date' },
          { id: 'icon', label: 'Sky', type: 'text' },
          { id: 'sky', label: 'In words', type: 'text' },
          { id: 'high', label: 'High', type: 'number' },
          { id: 'low', label: 'Low', type: 'number' },
          { id: 'rain', label: 'Rain', type: 'number' },
          { id: 'chance', label: 'Chance of rain, %', type: 'number' },
          { id: 'wind', label: 'Wind', type: 'number' },
          { id: 'uv', label: 'UV index', type: 'number' },
          { id: 'sunrise', label: 'Sunrise', type: 'text' },
          { id: 'sunset', label: 'Sunset', type: 'text' },
          { id: 'score', label: 'Good to be out (0 to 10)', type: 'number' },
        ],
      },
      { id: 'hours', label: 'The next 48 hours', type: 'table', columns: [{ id: 'time', label: 'Time', type: 'text' }, { id: 'hour', label: 'Hour', type: 'text' }, { id: 'temp', label: 'Temperature', type: 'number' }, { id: 'chance', label: 'Chance of rain, %', type: 'number' }, { id: 'icon', label: 'Sky', type: 'text' }] },
      { id: 'best', label: 'Best days', type: 'table', columns: [{ id: 'date', label: 'Date', type: 'date' }, { id: 'why', label: 'Why', type: 'text' }] },
      { id: 'wear', label: 'What to wear', type: 'list' },
      { id: 'alerts', label: 'Watch out for', type: 'list' },
      { id: 'dry', label: 'Dry days', type: 'number' },
      { id: 'unit', label: 'Temperature unit', type: 'text' },
      { id: 'wind_unit', label: 'Wind unit', type: 'text' },
      { id: 'rain_unit', label: 'Rain unit', type: 'text' },
    ],
    examples: [
      { id: 'a-week-in-lisbon', name: 'A week in Lisbon', inputs: { place: 'Lisbon', days: '7 days', plans: 'A day at the beach' }, checks: ['{{answer.days}} is not empty', '{{answer.place}} contains Portugal', '{{answer.unit}} = °C'] },
      { id: 'a-town-by-its-region-in-fahrenheit', name: 'A town by its region, in Fahrenheit', inputs: { place: 'Paris, Texas', days: '3 days', units: 'Fahrenheit' }, checks: ['{{answer.place}} contains Texas', '{{answer.unit}} = °F'] },
    ],
  },
  {
    id: 'best-time-to-visit',
    name: 'Best time to go',
    icon: 'sun',
    color: 'amber',
    category: 'Weather',
    description: 'The weather month by month anywhere, from the last five years: temperatures, rain and sunshine on charts, and the best months for what you want to do there.',
    fields: [
      { id: 'place', label: 'Where', type: 'text', required: true, placeholder: 'e.g. Crete, or Kyoto' },
      { id: 'for_what', label: 'Best for', type: 'choice', options: ['City sightseeing', 'Beach and sun', 'Hiking', 'Snow and skiing', 'Escaping the heat'], default: 'City sightseeing' },
      { id: 'units', label: 'Units', type: 'choice', options: ['Celsius', 'Fahrenheit'], default: 'Celsius' },
    ],
    prompt: '',
    flow: {
      steps: [
        { id: 'search', title: 'Look the place up', do: 'tool', tool: 'http_request', with: { url: 'https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json&name={{place}}' }, failed: 'skip' },
        {
          id: 'spot',
          title: 'Pick the place',
          do: 'code',
          language: 'javascript',
          with: { found: '{{search}}', place: '{{place}}', today: '{{today}}' },
          code:
            BODY +
            PLACE +
            String.raw`// The place, and the address of its weather day by day over the last five whole years; and, for its picture, its name
// as it is known without its country ("Paris, Texas", "Kyoto") and what it is (a country, or a place in one).
const p = await placeOf(input.found, input.place, ctx);
if (!p) throw new Error('No place called “' + input.place + '” was found: check its spelling, or add its country');
const year = Number(String(input.today || '').slice(0, 4)) || new Date().getFullYear();
const url =
  'https://archive-api.open-meteo.com/v1/archive?latitude=' + p.lat + '&longitude=' + p.lng + (p.coast ? '&elevation=0' : '') + '&timezone=auto' +
  '&start_date=' + (year - 5) + '-01-01&end_date=' + (year - 1) + '-12-31' +
  '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration,snowfall_sum';
const name = p.country && p.label.endsWith(', ' + p.country) ? p.label.slice(0, -(p.country.length + 2)) : p.label;
const kind = p.country && name === p.country ? 'country' : p.country ? 'in ' + p.country : '';
return { label: p.label, name, kind, lat: p.lat, lng: p.lng, at: p.lat + ',' + p.lng, url, years: (year - 5) + '–' + (year - 1) };`,
          outputs: [
            { id: 'label', label: 'Place', type: 'text' },
            { id: 'name', label: 'Its name', type: 'text' },
            { id: 'kind', label: 'What it is', type: 'text', description: 'A country, or a place in one' },
            { id: 'lat', label: 'Latitude', type: 'number' },
            { id: 'lng', label: 'Longitude', type: 'number' },
            { id: 'at', label: 'Where on a map', type: 'text' },
            { id: 'url', label: 'Its weather', type: 'url' },
            { id: 'years', label: 'Years', type: 'text' },
          ],
          failed: 'agent',
        },
        { id: 'media', title: 'Find its picture', do: 'tool', tool: 'find_media', with: { items: ['{{spot.name}}'], kind: '{{spot.kind}}' }, failed: 'skip' },
        {
          id: 'photo',
          title: 'Keep it if it is a photo',
          do: 'code',
          language: 'javascript',
          with: { media: '{{media.data}}' },
          code:
            LIST +
            String.raw`// The place's picture when it is a photo of it: a drawing (a map of where it is, its flag, a crest) is left out.
const m = list(input.media && input.media.items)[0];
const src = m && typeof m === 'object' ? String(m.picture || '') : '';
let file = '';
try {
  file = decodeURIComponent(new URL(src).pathname.split('/').pop());
} catch (e) {}
const drawn = /\.svg\b|(^|[_\-\s(])(map|maps|locator|location|flag|coat_of_arms|emblem|seal|dimos)([_\-\s.)]|$)/i.test(file);
return { picture: file && !drawn && /^https?:\/\/\S+$/.test(src) ? src : null };`,
          outputs: [{ id: 'picture', label: 'Picture', type: 'url' }],
          failed: 'agent',
        },
        { id: 'history', title: 'Get five years of weather', do: 'tool', tool: 'http_request', with: { url: '{{spot.url}}', max_chars: 200000 }, failed: 'agent' },
        {
          id: 'months',
          title: 'Average it by month',
          do: 'code',
          language: 'javascript',
          with: { history: '{{history}}', for_what: '{{for_what}}', units: '{{units}}' },
          code:
            BODY +
            String.raw`// Each month, averaged over the years: highs and lows, rain and rainy days, hours of sun a day and days with snow,
// with a score from 0 to 100 for what you want to do there; then the months in order of that score.
const h = bodyOf(input.history);
const d = h && h.daily;
if (!d || !Array.isArray(d.time) || !d.time.length) throw new Error('The weather of past years did not come back: try again in a minute');
const NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const m = NAMES.map(() => ({ high: [], low: [], rain: 0, wet: 0, sun: [], snow: 0, years: new Set() }));
d.time.forEach((t, i) => {
  const k = Number(String(t).slice(5, 7)) - 1;
  const x = m[k];
  if (!x) return;
  x.years.add(String(t).slice(0, 4));
  const v = (a) => (Array.isArray(a) && a[i] !== null && a[i] !== undefined && isFinite(Number(a[i])) ? Number(a[i]) : null);
  if (v(d.temperature_2m_max) !== null) x.high.push(v(d.temperature_2m_max));
  if (v(d.temperature_2m_min) !== null) x.low.push(v(d.temperature_2m_min));
  if (v(d.precipitation_sum) !== null) {
    x.rain += v(d.precipitation_sum);
    if (v(d.precipitation_sum) >= 1) x.wet++;
  }
  if (v(d.sunshine_duration) !== null) x.sun.push(v(d.sunshine_duration) / 3600);
  if ((v(d.snowfall_sum) || 0) >= 1) x.snow++;
});
const mean = (a) => (a.length ? a.reduce((s, y) => s + y, 0) / a.length : null);
const us = input.units === 'Fahrenheit';
const temp = (c) => (c === null ? null : Math.round((us ? c * 9 / 5 + 32 : c) * 10) / 10);
const fit = (x, lo, hi, soft) => (x === null ? 0 : x < lo ? Math.max(0, 1 - (lo - x) / soft) : x > hi ? Math.max(0, 1 - (x - hi) / soft) : 1);
const SCORE = {
  'City sightseeing': (r) => 50 * fit(r.high, 16, 26, 10) + 30 * Math.max(0, 1 - r.wet / 15) + 20 * Math.min(1, (r.sun || 0) / 8),
  'Beach and sun': (r) => 45 * fit(r.high, 27, 33, 7) + 30 * Math.min(1, (r.sun || 0) / 10) + 25 * Math.max(0, 1 - r.wet / 10),
  Hiking: (r) => 45 * fit(r.high, 12, 23, 9) + 35 * Math.max(0, 1 - r.wet / 14) + 20 * Math.max(0, 1 - r.snow / 6),
  'Snow and skiing': (r) => 60 * Math.min(1, r.snow / 10) + 40 * fit(r.high, -12, 2, 8),
  'Escaping the heat': (r) => 60 * fit(r.high, 8, 20, 10) + 25 * Math.max(0, 1 - r.wet / 15) + 15 * Math.max(0, 1 - r.snow / 6),
};
const score = SCORE[input.for_what] || SCORE['City sightseeing'];
const months = m.map((x, k) => {
  const years = Math.max(1, x.years.size);
  const r = { month: NAMES[k], n: k + 1, high: mean(x.high), low: mean(x.low), wet: x.wet / years, sun: mean(x.sun), snow: x.snow / years };
  const rain = x.rain / years;
  return {
    month: NAMES[k],
    n: k + 1,
    high: temp(r.high),
    low: temp(r.low),
    rain: Math.round((us ? rain / 25.4 : rain) * 10) / 10,
    wet_days: Math.round(r.wet * 10) / 10,
    sun: r.sun === null ? null : Math.round(r.sun * 10) / 10,
    snow_days: Math.round(r.snow * 10) / 10,
    score: Math.round(score(r)),
  };
});
const ranked = months.slice().sort((a, b) => b.score - a.score);
return { months, best: ranked.slice(0, 3).map((x) => x.month), worst: ranked.slice(-3).reverse().map((x) => x.month), unit: us ? '°F' : '°C', rain_unit: us ? 'in' : 'mm' };`,
          outputs: [
            {
              id: 'months',
              label: 'Months',
              type: 'table',
              columns: [
                { id: 'month', label: 'Month', type: 'text' },
                { id: 'n', label: 'Number', type: 'number' },
                { id: 'high', label: 'High', type: 'number' },
                { id: 'low', label: 'Low', type: 'number' },
                { id: 'rain', label: 'Rain in the month', type: 'number' },
                { id: 'wet_days', label: 'Rainy days', type: 'number' },
                { id: 'sun', label: 'Hours of sun a day', type: 'number' },
                { id: 'snow_days', label: 'Days with snow', type: 'number' },
                { id: 'score', label: 'Score', type: 'number' },
              ],
            },
            { id: 'best', label: 'Best months', type: 'list' },
            { id: 'worst', label: 'Worst months', type: 'list' },
            { id: 'unit', label: 'Temperature unit', type: 'text' },
            { id: 'rain_unit', label: 'Rain unit', type: 'text' },
          ],
          failed: 'agent',
        },
        {
          id: 'advise',
          title: 'Say when to go',
          do: 'model',
          instructions: `Say when to go to {{spot.label}} for {{for_what}}, from its weather month by month over {{spot.years}} below (temperatures in {{months.unit}}, rain in {{months.rain_unit}} a month; "score" is how well a month suits {{for_what}}, from 0 to 100). The scores put {{months.best}} first.

{{months.months}}

- summary: when to go and why in two or three sentences, the shoulder months too.
- best: the three best months, best first: each the month as written above (Jan, Feb…) and why, in a sentence with the numbers that matter.
- avoid: the months to avoid, each with why, in a few words.
- tips: a few tips for a visit then: what to pack for that weather, and what the season is usually like there (busy or quiet, dearer or cheaper) as far as is well known; say so when unsure.`,
          outputs: [
            { id: 'summary', label: 'In short', type: 'markdown', required: true },
            { id: 'best', label: 'Best months', type: 'table', columns: [{ id: 'month', label: 'Month', type: 'text' }, { id: 'why', label: 'Why', type: 'text' }] },
            { id: 'avoid', label: 'Months to avoid', type: 'list' },
            { id: 'tips', label: 'Tips', type: 'list' },
          ],
        },
      ],
      outputs: { place: '{{spot.label}}', years: '{{spot.years}}', summary: '{{advise.summary}}', months: '{{months.months}}', best: '{{advise.best}}', avoid: '{{advise.avoid}}', tips: '{{advise.tips}}', unit: '{{months.unit}}', rain_unit: '{{months.rain_unit}}', picture: '{{photo.picture}}' },
    },
    answer: [
      { id: 'place', label: 'Place', type: 'text', required: true },
      { id: 'years', label: 'Years', type: 'text' },
      { id: 'summary', label: 'In short', type: 'markdown', required: true },
      {
        id: 'months',
        label: 'Months',
        type: 'table',
        required: true,
        columns: [
          { id: 'month', label: 'Month', type: 'text' },
          { id: 'n', label: 'Number', type: 'number' },
          { id: 'high', label: 'High', type: 'number' },
          { id: 'low', label: 'Low', type: 'number' },
          { id: 'rain', label: 'Rain in the month', type: 'number' },
          { id: 'wet_days', label: 'Rainy days', type: 'number' },
          { id: 'sun', label: 'Hours of sun a day', type: 'number' },
          { id: 'snow_days', label: 'Days with snow', type: 'number' },
          { id: 'score', label: 'Score', type: 'number' },
        ],
      },
      { id: 'best', label: 'Best months', type: 'table', columns: [{ id: 'month', label: 'Month', type: 'text' }, { id: 'why', label: 'Why', type: 'text' }] },
      { id: 'avoid', label: 'Months to avoid', type: 'list' },
      { id: 'tips', label: 'Tips', type: 'list' },
      { id: 'unit', label: 'Temperature unit', type: 'text' },
      { id: 'rain_unit', label: 'Rain unit', type: 'text' },
      { id: 'picture', label: 'Picture', type: 'media', description: 'A picture of the place' },
    ],
    examples: [
      { id: 'crete-for-the-beach', name: 'Crete for the beach', inputs: { place: 'Crete', for_what: 'Beach and sun' }, checks: ['{{answer.months}} is not empty', '{{answer.best}} is not empty', '{{answer.picture}} is not empty'] },
      { id: 'somewhere-to-ski', name: 'Somewhere to ski', inputs: { place: 'Zermatt, Switzerland', for_what: 'Snow and skiing' }, checks: ['{{months.best}} does not contain Jul'] },
    ],
  },
  // ---- sports ------------------------------------------------------------------------------------------------------
  {
    id: 'team-tracker',
    name: 'Team tracker',
    icon: 'trophy',
    color: 'green',
    category: 'Sports',
    description: 'Any team at a glance: its next matches, latest results and form, where it stands in its league, and the week’s news about it.',
    fields: [
      { id: 'team', label: 'Team', type: 'text', required: true, placeholder: 'e.g. Arsenal, Boston Celtics, Olympiacos' },
      { id: 'sport', label: 'Sport or league', type: 'text', placeholder: 'e.g. Premier League, or basketball', help: 'Helps when several teams share the name' },
    ],
    prompt: '',
    flow: {
      steps: [
        { id: 'find_team', title: 'Find the team', do: 'tool', tool: 'http_request', with: { url: `${SPORTSDB}/searchteams.php?t={{team}}` }, failed: 'skip' },
        {
          id: 'team_info',
          title: 'Pick the team',
          do: 'code',
          language: 'javascript',
          with: { found: '{{find_team}}', team: '{{team}}', sport: '{{sport}}' },
          code:
            BODY +
            TEAM +
            String.raw`// The team, what TheSportsDB says of it, the addresses of its next and last matches there, and what to search the web
// for. A team it does not know is searched for by its name as written.
const t = teamOf(input.found, input.sport);
const name = t ? t.strTeam : String(input.team || '').trim();
const about = t && t.strDescriptionEN ? String(t.strDescriptionEN).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).slice(0, 2).join(' ') : '';
const base = '${SPORTSDB}/';
return {
  id: t ? String(t.idTeam) : '',
  name,
  sport: t ? t.strSport || '' : String(input.sport || '').trim(),
  league: t ? t.strLeague || '' : '',
  badge: t && /^https:\/\//.test(t.strBadge || '') ? t.strBadge : null,
  stadium: t ? t.strStadium || '' : '',
  country: t ? t.strCountry || '' : '',
  about,
  next_url: t ? base + 'eventsnext.php?id=' + t.idTeam : '',
  last_url: t ? base + 'eventslast.php?id=' + t.idTeam : '',
  query: [name, t ? t.strLeague || t.strSport : input.sport].filter(Boolean).join(' '),
};`,
          outputs: [
            { id: 'id', label: 'Its number at TheSportsDB', type: 'text' },
            { id: 'name', label: 'Team', type: 'text' },
            { id: 'sport', label: 'Sport', type: 'text' },
            { id: 'league', label: 'League', type: 'text' },
            { id: 'badge', label: 'Badge', type: 'url' },
            { id: 'stadium', label: 'Stadium', type: 'text' },
            { id: 'country', label: 'Country', type: 'text' },
            { id: 'about', label: 'About it', type: 'text' },
            { id: 'next_url', label: 'Its next match', type: 'text' },
            { id: 'last_url', label: 'Its last match', type: 'text' },
            { id: 'query', label: 'What to search for', type: 'text' },
          ],
          failed: 'agent',
        },
        { id: 'week_ago', title: 'A week ago', do: 'value', of: '{{today}}', op: 'date', arg: '-7' },
        {
          id: 'look',
          title: 'Look up its matches and news',
          do: 'parallel',
          branches: [
            [
              { id: 'next', title: 'Its next match', do: 'tool', tool: 'http_request', if: '{{team_info.next_url}} is not empty', with: { url: '{{team_info.next_url}}' }, failed: 'skip' },
              { id: 'last', title: 'Its last match', do: 'tool', tool: 'http_request', if: '{{team_info.last_url}} is not empty', with: { url: '{{team_info.last_url}}' }, failed: 'skip' },
            ],
            [{ id: 'games', title: 'Search for its results and fixtures', do: 'tool', tool: 'web_search', with: { query: '{{team_info.query}} results fixtures schedule', k: 10 }, failed: 'skip' }],
            [{ id: 'news', title: 'Search the week’s news', do: 'tool', tool: 'web_search', with: { query: '{{team_info.name}} {{team_info.sport}}', categories: ['news'], from: '{{week_ago.value}}', to: '{{today}}', k: 8 }, failed: 'skip' }],
          ],
        },
        {
          id: 'pick_page',
          title: 'Pick a page of its matches',
          do: 'code',
          language: 'javascript',
          with: { games: '{{games}}', next: '{{next}}', last: '{{last}}', team: '{{team_info.name}}' },
          code:
            BODY +
            HITS +
            String.raw`// The page most likely to list the team's results and fixtures (a sports site's page for the team, before news, social
// media and ticket shops), and its next and last matches as TheSportsDB lists them, in a line each.
const GOOD = /(^|\.)(bbc\.co\.uk|bbc\.com|espn\.com|espn\.co\.uk|skysports\.com|nba\.com|nfl\.com|mlb\.com|nhl\.com|wnba\.com|premierleague\.com|uefa\.com|fifa\.com|cbssports\.com|foxsports\.com|eurosport\.[a-z.]+|theguardian\.com|transfermarkt\.[a-z.]+|worldfootball\.net|soccerway\.com|fbref\.com|basketball-reference\.com|pro-football-reference\.com|baseball-reference\.com|hockey-reference\.com|espncricinfo\.com|formula1\.com|euroleaguebasketball\.net|laliga\.com|bundesliga\.com|legaseriea\.it|ligue1\.com|rugbypass\.com)$/;
const BAD = /(^|\.)(facebook\.com|instagram\.com|x\.com|twitter\.com|tiktok\.com|youtube\.com|reddit\.com|pinterest\.[a-z.]+|amazon\.[a-z.]+|ebay\.[a-z.]+|ticketmaster\.[a-z.]+|stubhub\.[a-z.]+|seatgeek\.com|viagogo\.[a-z.]+|vividseats\.com)$/;
const WORDS = /fixture|result|schedule|score|calendar|match/i;
const hits = hitsOf(input.games).filter((h) => !BAD.test(siteOf(h.url)));
const score = (h) => (GOOD.test(siteOf(h.url)) ? 10 : 0) + (WORDS.test(h.title + ' ' + h.url) ? 5 : 0) - h.rank;
const best = hits.sort((a, b) => score(b) - score(a))[0];
const line = (e) => [e.dateEvent, String(e.strTime || '').slice(0, 5), e.strEvent, e.strLeague, e.intHomeScore !== null && e.intHomeScore !== undefined && e.intHomeScore !== '' ? e.intHomeScore + '–' + e.intAwayScore : ''].filter(Boolean).join(' · ');
const events = (r) => {
  const b = bodyOf(r) || {};
  return b.events || b.results || [];
};
const known = [...events(input.next).map((e) => 'Next: ' + line(e)), ...events(input.last).map((e) => 'Last: ' + line(e))].join('\n');
return { url: best ? best.url : '', title: best ? best.title : '', known };`,
          outputs: [
            { id: 'url', label: 'Page', type: 'url' },
            { id: 'title', label: 'Its title', type: 'text' },
            { id: 'known', label: 'Its next and last match', type: 'text' },
          ],
          failed: 'agent',
        },
        { id: 'read', title: 'Read its results and fixtures', do: 'tool', tool: 'read_page', if: '{{pick_page.url}} is not empty', with: { url: '{{pick_page.url}}', question: 'Results and upcoming fixtures of {{team_info.name}}: dates, opponents, home or away, competition, scores' }, failed: 'skip' },
        {
          id: 'extract',
          title: 'Pull out its matches and news',
          do: 'model',
          instructions: `Today is {{today}}. From the sources below, say what {{team_info.name}} ({{team_info.sport}}{{#team_info.league}}, {{team_info.league}}{{/team_info.league}}) did lately and what comes next. Only what the sources say; where they disagree, the most recent wins.
{{#pick_page.known}}
As TheSportsDB lists them:
{{pick_page.known}}
{{/pick_page.known}}{{#read.text}}
A page of its matches ({{pick_page.url}}):
{{read.text}}
{{/read.text}}
Search results:
{{games.text}}

News of the past week:
{{news.text}}

- results: its latest results, newest first, at most ten: the date (YYYY-MM-DD), the opponent, whether it played at home, the competition, and what it scored and conceded (goals, points or runs).
- fixtures: its next matches, soonest first, at most six: the date (YYYY-MM-DD), the local time if given (HH:MM), the opponent, whether at home, and the competition.
- position: where it stands in its league or group, in a few words (like "2nd of 20, 21 points after 9 games"); empty when the sources do not say.
- news: up to five stories of the past week about it: the title, its address, its source, its date and the gist in a sentence.
- summary: how the team is doing, in two or three sentences.`,
          outputs: [
            {
              id: 'results',
              label: 'Results',
              type: 'table',
              columns: [
                { id: 'date', label: 'Date', type: 'text' },
                { id: 'opponent', label: 'Opponent', type: 'text' },
                { id: 'home', label: 'At home', type: 'yesno' },
                { id: 'competition', label: 'Competition', type: 'text' },
                { id: 'scored', label: 'Scored', type: 'number' },
                { id: 'conceded', label: 'Conceded', type: 'number' },
              ],
            },
            {
              id: 'fixtures',
              label: 'Fixtures',
              type: 'table',
              columns: [
                { id: 'date', label: 'Date', type: 'text' },
                { id: 'time', label: 'Time', type: 'text' },
                { id: 'opponent', label: 'Opponent', type: 'text' },
                { id: 'home', label: 'At home', type: 'yesno' },
                { id: 'competition', label: 'Competition', type: 'text' },
              ],
            },
            { id: 'position', label: 'Where it stands', type: 'text' },
            { id: 'news', label: 'News', type: 'table', columns: [{ id: 'title', label: 'Story', type: 'text' }, { id: 'url', label: 'Link', type: 'url' }, { id: 'source', label: 'Source', type: 'text' }, { id: 'date', label: 'Date', type: 'text' }, { id: 'gist', label: 'In a sentence', type: 'text' }] },
            { id: 'summary', label: 'How it is doing', type: 'markdown', required: true },
          ],
        },
        {
          id: 'tally',
          title: 'Count up its form',
          do: 'code',
          language: 'javascript',
          with: { results: '{{extract.results}}', fixtures: '{{extract.fixtures}}', news: '{{extract.news}}', next: '{{next}}', last: '{{last}}', team: '{{team_info.name}}', today: '{{today}}' },
          code:
            LIST +
            BODY +
            String.raw`// Its results newest first, each won, drawn or lost, and its form (the last five, oldest first); its fixtures soonest
// first, with the days to each; the next one on its own. What TheSportsDB lists stands in where the sources gave none.
const today = String(input.today || '').slice(0, 10);
const day = (v) => (/^\d{4}-\d{2}-\d{2}/.exec(String(v || '')) || [''])[0];
const yes = (v) => v === true || /^(yes|true|home|h)$/i.test(String(v || '').trim());
const link = (v) => (/^https?:\/\/\S+$/.test(String(v || '').trim()) ? String(v).trim() : null);
let results = rows(input.results).map((r) => ({ date: day(r.date), opponent: String(r.opponent || '').trim(), home: yes(r.home), competition: String(r.competition || '').trim(), scored: num(r.scored), conceded: num(r.conceded) }));
let fixtures = rows(input.fixtures).map((f) => ({ date: day(f.date), time: String(f.time || '').slice(0, 5), opponent: String(f.opponent || '').trim(), home: yes(f.home), competition: String(f.competition || '').trim() }));
const events = (r) => {
  const b = bodyOf(r) || {};
  return b.events || b.results || [];
};
const me = String(input.team || '').toLowerCase();
const side = (e) => String(e.strHomeTeam || '').toLowerCase() === me || (me && String(e.strHomeTeam || '').toLowerCase().includes(me));
if (!fixtures.length) for (const e of events(input.next)) fixtures.push({ date: day(e.dateEvent), time: String(e.strTime || '').slice(0, 5), opponent: side(e) ? e.strAwayTeam : e.strHomeTeam, home: side(e), competition: e.strLeague || '' });
if (!results.length)
  for (const e of events(input.last)) {
    const h = num(e.intHomeScore);
    const a = num(e.intAwayScore);
    if (h !== null && a !== null) results.push({ date: day(e.dateEvent), opponent: side(e) ? e.strAwayTeam : e.strHomeTeam, home: side(e), competition: e.strLeague || '', scored: side(e) ? h : a, conceded: side(e) ? a : h });
  }
const seen = new Set();
results = results
  .filter((r) => r.opponent && r.scored !== null && r.conceded !== null && (!r.date || !today || r.date <= today))
  .filter((r) => !seen.has(r.date + r.opponent) && seen.add(r.date + r.opponent))
  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  .slice(0, 10)
  .map((r) => ({ date: r.date || null, opponent: r.opponent, venue: r.home ? 'Home' : 'Away', competition: r.competition, score: r.scored + '–' + r.conceded, result: r.scored > r.conceded ? 'W' : r.scored < r.conceded ? 'L' : 'D', scored: r.scored, conceded: r.conceded }));
const until = (d) => (d && today ? Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000) : null);
fixtures = fixtures
  .filter((f) => f.opponent && (!f.date || !today || f.date >= today))
  .sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))
  .slice(0, 6)
  .map((f) => ({ date: f.date || null, time: /^\d{1,2}:\d{2}$/.test(f.time) ? f.time : '', opponent: f.opponent, venue: f.home ? 'Home' : 'Away', competition: f.competition, days: until(f.date) }));
const n = (k) => results.filter((r) => r.result === k).length;
const next = fixtures[0] || {};
return {
  results,
  fixtures,
  news: rows(input.news).filter((x) => x.title).slice(0, 5).map((x) => ({ title: String(x.title), source: String(x.source || ''), date: String(x.date || ''), gist: String(x.gist || ''), url: link(x.url) })),
  form: results.slice(0, 5).reverse().map((r) => r.result).join(' '),
  wins: n('W'),
  draws: n('D'),
  losses: n('L'),
  next_opponent: next.opponent || '',
  next_date: next.date || null,
  next_time: next.time || '',
  next_venue: next.venue || '',
  next_competition: next.competition || '',
  next_days: next.days === undefined ? null : next.days,
};`,
          outputs: [
            { id: 'results', label: 'Results', type: 'table', columns: RESULT_COLS },
            { id: 'fixtures', label: 'Fixtures', type: 'table', columns: FIXTURE_COLS },
            { id: 'news', label: 'News', type: 'table', columns: NEWS_COLS },
            { id: 'form', label: 'Form', type: 'text' },
            { id: 'wins', label: 'Won', type: 'number' },
            { id: 'draws', label: 'Drawn', type: 'number' },
            { id: 'losses', label: 'Lost', type: 'number' },
            { id: 'next_opponent', label: 'Next opponent', type: 'text' },
            { id: 'next_date', label: 'Next match', type: 'date' },
            { id: 'next_time', label: 'Kick-off', type: 'text' },
            { id: 'next_venue', label: 'Home or away', type: 'text' },
            { id: 'next_competition', label: 'Competition', type: 'text' },
            { id: 'next_days', label: 'Days to go', type: 'number' },
          ],
          failed: 'agent',
        },
      ],
      outputs: {
        team: '{{team_info.name}}',
        badge: '{{team_info.badge}}',
        sport: '{{team_info.sport}}',
        league: '{{team_info.league}}',
        stadium: '{{team_info.stadium}}',
        about: '{{team_info.about}}',
        summary: '{{extract.summary}}',
        position: '{{extract.position}}',
        form: '{{tally.form}}',
        wins: '{{tally.wins}}',
        draws: '{{tally.draws}}',
        losses: '{{tally.losses}}',
        next_opponent: '{{tally.next_opponent}}',
        next_date: '{{tally.next_date}}',
        next_time: '{{tally.next_time}}',
        next_venue: '{{tally.next_venue}}',
        next_competition: '{{tally.next_competition}}',
        next_days: '{{tally.next_days}}',
        results: '{{tally.results}}',
        fixtures: '{{tally.fixtures}}',
        news: '{{tally.news}}',
      },
    },
    answer: [
      { id: 'team', label: 'Team', type: 'text', required: true },
      { id: 'badge', label: 'Badge', type: 'url' },
      { id: 'sport', label: 'Sport', type: 'text' },
      { id: 'league', label: 'League', type: 'text' },
      { id: 'stadium', label: 'Stadium', type: 'text' },
      { id: 'about', label: 'About it', type: 'text' },
      { id: 'summary', label: 'How it is doing', type: 'markdown', required: true },
      { id: 'position', label: 'Where it stands', type: 'text' },
      { id: 'form', label: 'Form', type: 'text', description: 'Its last five results, oldest first: W, D or L, with spaces between' },
      { id: 'wins', label: 'Won', type: 'number' },
      { id: 'draws', label: 'Drawn', type: 'number' },
      { id: 'losses', label: 'Lost', type: 'number' },
      { id: 'next_opponent', label: 'Next opponent', type: 'text' },
      { id: 'next_date', label: 'Next match', type: 'date' },
      { id: 'next_time', label: 'Kick-off', type: 'text' },
      { id: 'next_venue', label: 'Home or away', type: 'text' },
      { id: 'next_competition', label: 'Competition', type: 'text' },
      { id: 'next_days', label: 'Days to go', type: 'number' },
      { id: 'results', label: 'Results', type: 'table', columns: RESULT_COLS },
      { id: 'fixtures', label: 'Fixtures', type: 'table', columns: FIXTURE_COLS },
      { id: 'news', label: 'News', type: 'table', columns: NEWS_COLS },
    ],
    examples: [
      { id: 'a-football-club', name: 'A football club', inputs: { team: 'Arsenal', sport: 'Premier League' }, checks: ['{{answer.team}} contains Arsenal', '{{answer.summary}} is not empty'] },
      { id: 'a-basketball-team', name: 'A basketball team', inputs: { team: 'Boston Celtics' }, checks: ['{{team_info.sport}} = Basketball'] },
    ],
  },
  {
    id: 'match-preview',
    name: 'Match preview',
    icon: 'trophy',
    color: 'orange',
    category: 'Sports',
    description: 'Two teams before they meet: their form, the last meetings, team news and what the experts expect, with the chances of each result.',
    fields: [
      { id: 'team', label: 'Team', type: 'text', required: true, placeholder: 'e.g. Arsenal' },
      { id: 'opponent', label: 'Opponent', type: 'text', required: true, placeholder: 'e.g. Chelsea' },
      { id: 'competition', label: 'Sport or competition', type: 'text', placeholder: 'e.g. Premier League, or the NBA' },
    ],
    prompt: '',
    flow: {
      steps: [
        {
          id: 'look',
          title: 'Look both teams up',
          do: 'parallel',
          branches: [
            [{ id: 'find_team', title: 'Find the team', do: 'tool', tool: 'http_request', with: { url: `${SPORTSDB}/searchteams.php?t={{team}}` }, failed: 'skip' }],
            [{ id: 'find_opponent', title: 'Find the opponent', do: 'tool', tool: 'http_request', with: { url: `${SPORTSDB}/searchteams.php?t={{opponent}}` }, failed: 'skip' }],
            [{ id: 'previews', title: 'Search for previews', do: 'tool', tool: 'web_search', with: { query: '{{team}} vs {{opponent}} {{competition}} preview prediction team news', k: 10 }, failed: 'skip' }],
            [{ id: 'meetings', title: 'Search for their last meetings', do: 'tool', tool: 'web_search', with: { query: '{{team}} {{opponent}} head to head last meetings results', k: 8 }, failed: 'skip' }],
          ],
        },
        {
          id: 'sources',
          title: 'Pick the previews to read',
          do: 'code',
          language: 'javascript',
          with: { previews: '{{previews}}', team: '{{find_team}}', opponent: '{{find_opponent}}', team_name: '{{team}}', opponent_name: '{{opponent}}', competition: '{{competition}}' },
          code:
            BODY +
            HITS +
            TEAM +
            String.raw`// Two previews to read, from sports sites and newspapers before betting tips and social media; and the two teams as
// TheSportsDB has them, for their names and badges.
const GOOD = /(^|\.)(bbc\.co\.uk|bbc\.com|espn\.com|espn\.co\.uk|skysports\.com|nba\.com|nfl\.com|mlb\.com|nhl\.com|premierleague\.com|uefa\.com|cbssports\.com|foxsports\.com|theguardian\.com|independent\.co\.uk|telegraph\.co\.uk|nytimes\.com|theathletic\.com|si\.com|goal\.com|football365\.com|eurosport\.[a-z.]+|marca\.com|as\.com|gazzetta\.it|lequipe\.fr|kicker\.de|reuters\.com|apnews\.com)$/;
const BAD = /(^|\.)(facebook\.com|instagram\.com|x\.com|twitter\.com|tiktok\.com|youtube\.com|reddit\.com|pinterest\.[a-z.]+)$|bet|odds|tips|casino|gambl/i;
const hits = hitsOf(input.previews).filter((h) => !BAD.test(siteOf(h.url)));
const score = (h) => (GOOD.test(siteOf(h.url)) ? 10 : 0) + (/preview|predict|team news|line-?up/i.test(h.title) ? 4 : 0) - h.rank;
const items = hits.sort((a, b) => score(b) - score(a)).slice(0, 2).map((h) => ({ url: h.url, title: h.title }));
const a = teamOf(input.team, input.competition);
const b = teamOf(input.opponent, input.competition);
const badge = (t) => (t && /^https:\/\//.test(t.strBadge || '') ? t.strBadge : null);
return {
  items,
  team: a ? a.strTeam : String(input.team_name || '').trim(),
  opponent: b ? b.strTeam : String(input.opponent_name || '').trim(),
  team_badge: badge(a),
  opponent_badge: badge(b),
  sport: (a && a.strSport) || (b && b.strSport) || '',
};`,
          outputs: [
            { id: 'items', label: 'Previews to read', type: 'table', columns: [{ id: 'url', label: 'Link', type: 'url' }, { id: 'title', label: 'Title', type: 'text' }] },
            { id: 'team', label: 'Team', type: 'text' },
            { id: 'opponent', label: 'Opponent', type: 'text' },
            { id: 'team_badge', label: 'Its badge', type: 'url' },
            { id: 'opponent_badge', label: 'The opponent’s badge', type: 'url' },
            { id: 'sport', label: 'Sport', type: 'text' },
          ],
          failed: 'agent',
        },
        {
          id: 'read',
          title: 'Read the previews',
          do: 'repeat',
          over: '{{sources.items}}',
          atOnce: 2,
          as: 'page',
          steps: [{ id: 'page_text', title: 'Read a preview', do: 'tool', tool: 'read_page', with: { url: '{{page.url}}', question: 'Form, head-to-head, team news (injuries, suspensions), likely line-ups, and the prediction for {{team}} against {{opponent}}' }, failed: 'skip' }],
        },
        {
          id: 'preview',
          title: 'Write the preview',
          do: 'model',
          instructions: `Write a short preview of {{sources.team}} against {{sources.opponent}}{{#competition}} ({{competition}}){{/competition}}{{#sources.sport}}, a {{sources.sport}} match{{/sources.sport}}, from the sources below. Today is {{today}}: it is their next meeting. Only what the sources say; say so where they say nothing.

Previews:
{{read.items}}

Search results:
{{previews.text}}

Their last meetings:
{{meetings.text}}

- when, competition, venue: when and where they play, as the sources say.
- summary: what to expect, in three or four sentences.
- prediction: a likely result, like "{{sources.team}} 2–1 {{sources.opponent}}".
- team_win, draw, opponent_win: the chances of each result in percent (they add up to 100; a draw is 0 where the sport has none), from the sources' predictions and the form.
- team_form, opponent_form: each team's last five results, oldest first, as letters (W, D, L).
- meetings: their last meetings, newest first, at most six: the date, the home team, the away team and the score.
- team_news, opponent_news: injuries, suspensions and doubts for each.
- keys: three to five things to watch.`,
          outputs: [
            { id: 'when', label: 'When', type: 'text' },
            { id: 'competition', label: 'Competition', type: 'text' },
            { id: 'venue', label: 'Where', type: 'text' },
            { id: 'summary', label: 'What to expect', type: 'markdown', required: true },
            { id: 'prediction', label: 'Prediction', type: 'text' },
            { id: 'team_win', label: 'Chance the team wins, %', type: 'number' },
            { id: 'draw', label: 'Chance of a draw, %', type: 'number' },
            { id: 'opponent_win', label: 'Chance the opponent wins, %', type: 'number' },
            { id: 'team_form', label: 'The team’s form', type: 'text' },
            { id: 'opponent_form', label: 'The opponent’s form', type: 'text' },
            { id: 'meetings', label: 'Last meetings', type: 'table', columns: [{ id: 'date', label: 'Date', type: 'text' }, { id: 'home', label: 'Home', type: 'text' }, { id: 'away', label: 'Away', type: 'text' }, { id: 'score', label: 'Score', type: 'text' }] },
            { id: 'team_news', label: 'The team’s news', type: 'list' },
            { id: 'opponent_news', label: 'The opponent’s news', type: 'list' },
            { id: 'keys', label: 'What to watch', type: 'list' },
          ],
        },
        {
          id: 'odds',
          title: 'Weigh up the chances',
          do: 'code',
          language: 'javascript',
          with: { team: '{{sources.team}}', opponent: '{{sources.opponent}}', team_win: '{{preview.team_win}}', draw: '{{preview.draw}}', opponent_win: '{{preview.opponent_win}}', team_form: '{{preview.team_form}}', opponent_form: '{{preview.opponent_form}}', meetings: '{{preview.meetings}}' },
          code:
            LIST +
            String.raw`// The chances made to add up to 100, the forms as five letters at most, and who won each of the last meetings, counted.
let a = Math.max(0, num(input.team_win) || 0);
let d = Math.max(0, num(input.draw) || 0);
let b = Math.max(0, num(input.opponent_win) || 0);
const sum = a + d + b;
if (sum > 0) {
  a = Math.round((a * 100) / sum);
  d = Math.round((d * 100) / sum);
  b = 100 - a - d;
}
const team = String(input.team || '');
const opp = String(input.opponent || '');
const chances = sum > 0 ? [{ outcome: team, pct: a }, ...(d > 0 ? [{ outcome: 'Draw', pct: d }] : []), { outcome: opp, pct: b }] : [];
const letters = (s) => (String(s || '').toUpperCase().match(/[WDL]/g) || []).slice(-5).join(' ');
const low = (s) => String(s || '').toLowerCase();
const same = (x, y) => low(x) && (low(x).includes(low(y)) || low(y).includes(low(x)));
const meetings = rows(input.meetings).slice(0, 6).map((m) => {
  const s = /(\d+)\s*[-–:]\s*(\d+)/.exec(String(m.score || ''));
  const h = s ? Number(s[1]) : null;
  const w = s ? Number(s[2]) : null;
  const winner = h === null ? '' : h === w ? 'Draw' : h > w ? String(m.home || '') : String(m.away || '');
  return { date: String(m.date || ''), home: String(m.home || ''), away: String(m.away || ''), score: String(m.score || ''), winner };
});
const tally = [
  { who: team, wins: meetings.filter((m) => same(m.winner, team)).length },
  { who: 'Draw', wins: meetings.filter((m) => m.winner === 'Draw').length },
  { who: opp, wins: meetings.filter((m) => same(m.winner, opp)).length },
];
return { chances, team_pct: a, draw_pct: d, opponent_pct: b, team_form: letters(input.team_form), opponent_form: letters(input.opponent_form), meetings, tally };`,
          outputs: [
            { id: 'chances', label: 'Chances', type: 'table', columns: [{ id: 'outcome', label: 'Result', type: 'text' }, { id: 'pct', label: 'Chance, %', type: 'number' }] },
            { id: 'team_pct', label: 'Chance the team wins, %', type: 'number' },
            { id: 'draw_pct', label: 'Chance of a draw, %', type: 'number' },
            { id: 'opponent_pct', label: 'Chance the opponent wins, %', type: 'number' },
            { id: 'team_form', label: 'The team’s form', type: 'text' },
            { id: 'opponent_form', label: 'The opponent’s form', type: 'text' },
            { id: 'meetings', label: 'Last meetings', type: 'table', columns: MEETING_COLS },
            { id: 'tally', label: 'Who won them', type: 'table', columns: [{ id: 'who', label: 'Who', type: 'text' }, { id: 'wins', label: 'Times', type: 'number' }] },
          ],
          failed: 'agent',
        },
      ],
      outputs: {
        team: '{{sources.team}}',
        opponent: '{{sources.opponent}}',
        team_badge: '{{sources.team_badge}}',
        opponent_badge: '{{sources.opponent_badge}}',
        when: '{{preview.when}}',
        competition: '{{preview.competition}}',
        venue: '{{preview.venue}}',
        summary: '{{preview.summary}}',
        prediction: '{{preview.prediction}}',
        chances: '{{odds.chances}}',
        team_pct: '{{odds.team_pct}}',
        draw_pct: '{{odds.draw_pct}}',
        opponent_pct: '{{odds.opponent_pct}}',
        team_form: '{{odds.team_form}}',
        opponent_form: '{{odds.opponent_form}}',
        meetings: '{{odds.meetings}}',
        tally: '{{odds.tally}}',
        team_news: '{{preview.team_news}}',
        opponent_news: '{{preview.opponent_news}}',
        keys: '{{preview.keys}}',
      },
    },
    answer: [
      { id: 'team', label: 'Team', type: 'text', required: true },
      { id: 'opponent', label: 'Opponent', type: 'text', required: true },
      { id: 'team_badge', label: 'Its badge', type: 'url' },
      { id: 'opponent_badge', label: 'The opponent’s badge', type: 'url' },
      { id: 'when', label: 'When', type: 'text' },
      { id: 'competition', label: 'Competition', type: 'text' },
      { id: 'venue', label: 'Where', type: 'text' },
      { id: 'summary', label: 'What to expect', type: 'markdown', required: true },
      { id: 'prediction', label: 'Prediction', type: 'text' },
      { id: 'chances', label: 'Chances', type: 'table', columns: [{ id: 'outcome', label: 'Result', type: 'text' }, { id: 'pct', label: 'Chance, %', type: 'number' }] },
      { id: 'team_pct', label: 'Chance the team wins, %', type: 'number' },
      { id: 'draw_pct', label: 'Chance of a draw, %', type: 'number' },
      { id: 'opponent_pct', label: 'Chance the opponent wins, %', type: 'number' },
      { id: 'team_form', label: 'The team’s form', type: 'text' },
      { id: 'opponent_form', label: 'The opponent’s form', type: 'text' },
      { id: 'meetings', label: 'Last meetings', type: 'table', columns: MEETING_COLS },
      { id: 'tally', label: 'Who won them', type: 'table', columns: [{ id: 'who', label: 'Who', type: 'text' }, { id: 'wins', label: 'Times', type: 'number' }] },
      { id: 'team_news', label: 'The team’s news', type: 'list' },
      { id: 'opponent_news', label: 'The opponent’s news', type: 'list' },
      { id: 'keys', label: 'What to watch', type: 'list' },
    ],
    examples: [
      { id: 'a-league-match', name: 'A league match', inputs: { team: 'Arsenal', opponent: 'Chelsea', competition: 'Premier League' }, checks: ['{{answer.summary}} is not empty', '{{odds.team_pct}} >= 0'] },
      { id: 'basketball-no-draws', name: 'Basketball, no draws', inputs: { team: 'Boston Celtics', opponent: 'New York Knicks', competition: 'NBA' }, checks: ['{{answer.draw_pct}} = 0'] },
    ],
  },
  // ---- food --------------------------------------------------------------------------------------------------------
  {
    id: 'fridge-recipes',
    name: 'Cook with what you have',
    icon: 'chef-hat',
    color: 'orange',
    category: 'Food',
    description: 'Recipes for what is in your fridge: what each uses of yours and what is missing, with photos, the steps timed out, and a video when there is one.',
    fields: [
      { id: 'have', label: 'What you have', type: 'long', required: true, placeholder: 'e.g. chicken, rice, peppers, garlic, a lemon, eggs' },
      { id: 'diet', label: 'Diet', type: 'choice', options: ['Anything', 'Vegetarian', 'Vegan', 'No pork', 'Gluten-free'], default: 'Anything' },
      { id: 'time', label: 'Time to cook', type: 'choice', options: ['Any', 'Under 30 minutes', 'Under an hour'], default: 'Any' },
      { id: 'basics', label: 'Count salt, oil and spices as there', type: 'yesno', default: 'Yes' },
    ],
    prompt: '',
    flow: {
      steps: [
        {
          id: 'items',
          title: 'List what you have',
          do: 'code',
          language: 'javascript',
          with: { have: '{{have}}', diet: '{{diet}}' },
          code:
            KITCHEN +
            String.raw`// What you have, one thing each, without amounts; and the searches of the recipe database: each thing as written and
// in the other number ("egg" and "eggs" find different recipes), six things at most, the basics last; and the
// recipes of a vegetarian or vegan diet, to keep to them.
const have = [];
for (const part of String(input.have || '').split(/,|;|\n|\band\b|\+/i)) {
  const t = part.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/^\s*[\d.,\/½¼¾]+\s*[a-z]{0,5}\.?\s+(?:of\s+)?/i, '').trim();
  const w = words(t);
  if (w.length && !have.some((h) => words(h).join(' ') === w.join(' '))) have.push(w.join(' '));
}
if (!have.length) throw new Error('Say what you have, like: chicken, rice, peppers');
const main = have.filter((h) => !isStaple(h)).concat(have.filter((h) => isStaple(h))).slice(0, 6);
const other = (t) => {
  const w = t.split(' ');
  const last = w[w.length - 1];
  w[w.length - 1] = /o$/.test(last) ? last + 'es' : last + 's';
  return w.join(' ');
};
const items = [];
main.forEach((t, n) => {
  for (const term of [t, other(t)]) items.push({ n: n + 1, term, url: '${MEALDB}/filter.php?i=' + encodeURIComponent(term.replace(/ /g, '_')) });
});
if (input.diet === 'Vegetarian' || input.diet === 'Vegan') for (const c of input.diet === 'Vegan' ? ['Vegan'] : ['Vegetarian', 'Vegan']) items.push({ n: 0, term: c, url: '${MEALDB}/filter.php?c=' + c });
return { items, have, count: have.length };`,
          outputs: [
            { id: 'items', label: 'Searches', type: 'table', columns: [{ id: 'n', label: 'Thing', type: 'number' }, { id: 'term', label: 'Search', type: 'text' }, { id: 'url', label: 'Address', type: 'url' }] },
            { id: 'have', label: 'What you have', type: 'list' },
            { id: 'count', label: 'How many things', type: 'number' },
          ],
          failed: 'agent',
        },
        { id: 'search', title: 'Find recipes with them', do: 'repeat', over: '{{items.items}}', atOnce: 4, as: 'term', steps: [{ id: 'found', title: 'Search the recipes', do: 'tool', tool: 'http_request', with: { url: '{{term.url}}' }, failed: 'skip' }] },
        {
          id: 'shortlist',
          title: 'Shortlist the recipes',
          do: 'code',
          language: 'javascript',
          with: { items: '{{items.items}}', found: '{{search.items}}' },
          code:
            LIST +
            BODY +
            String.raw`// The recipes that use the most of what you have (a recipe found for several of your things counts each once), eight to
// look at closely; with a vegetarian or vegan diet, only the recipes of that kind when there are enough of them.
const items = rows(input.items);
const found = list(input.found);
const meals = new Map();
const diet = new Set();
found.forEach((r, i) => {
  const it = items[i];
  if (!it) return;
  for (const m of (bodyOf(r) || {}).meals || []) {
    if (!it.n) {
      diet.add(m.idMeal);
      continue;
    }
    const x = meals.get(m.idMeal) || { id: m.idMeal, name: m.strMeal, hits: new Set() };
    x.hits.add(it.n);
    meals.set(m.idMeal, x);
  }
});
let all = [...meals.values()];
if (diet.size && all.filter((m) => diet.has(m.id)).length >= 3) all = all.filter((m) => diet.has(m.id));
all.sort((a, b) => b.hits.size - a.hits.size);
return { items: all.slice(0, 8).map((m) => ({ id: m.id, name: m.name, matched: m.hits.size, url: '${MEALDB}/lookup.php?i=' + m.id })), count: meals.size };`,
          outputs: [
            { id: 'items', label: 'Recipes to look at', type: 'table', columns: [{ id: 'id', label: 'Its number', type: 'text' }, { id: 'name', label: 'Recipe', type: 'text' }, { id: 'matched', label: 'Of your things', type: 'number' }, { id: 'url', label: 'Address', type: 'url' }] },
            { id: 'count', label: 'Recipes found', type: 'number' },
          ],
          failed: 'agent',
        },
        { id: 'details', title: 'Get each recipe', do: 'repeat', over: '{{shortlist.items}}', atOnce: 4, as: 'meal', steps: [{ id: 'recipe', title: 'Get the recipe', do: 'tool', tool: 'http_request', with: { url: '{{meal.url}}' }, failed: 'skip' }] },
        {
          id: 'rank',
          title: 'See what each needs',
          do: 'code',
          language: 'javascript',
          with: { found: '{{details.items}}', have: '{{items.have}}', diet: '{{diet}}', basics: '{{basics}}' },
          code:
            LIST +
            BODY +
            KITCHEN +
            String.raw`// Each recipe against what you have: what it uses of yours, what you would need (the basics count as there when the
// form says so), whether it suits the diet; the closest six first. And the method of the first four, for timing.
const have = list(input.have).map(String);
const basics = input.basics !== 'No';
const out = [];
for (const r of list(input.found)) {
  const m = ((bodyOf(r) || {}).meals || [])[0];
  if (!m) continue;
  const ings = ingredientsOf(m);
  if (!suits(input.diet, m.strCategory, ings.map((x) => x.item))) continue;
  const mine = (x) => have.some((h) => matches(h, x.item));
  const used = ings.filter(mine);
  const needed = ings.filter((x) => !mine(x) && !(basics && isStaple(x.item)));
  // Meat or fish you would have to buy counts against a recipe most.
  out.push({ m, ings, used, needed, score: used.length * 10 - needed.length * 3 - needed.filter((x) => MEAT.test(x.item) || FISH.test(x.item)).length * 12 });
}
out.sort((a, b) => b.score - a.score);
const top = out.slice(0, 6);
const recipes = top.map(({ m, used, needed }) => ({
  name: m.strMeal,
  picture: linkOf(m.strMealThumb),
  area: m.strArea || m.strCountry || '',
  minutes: null,
  difficulty: '',
  uses: used.length,
  missing: needed.length,
  uses_list: used.map((x) => x.item).join(', '),
  missing_list: needed.map((x) => x.item).join(', '),
  fits: null,
  video: linkOf(m.strYoutube),
  link: linkOf(m.strSource) || 'https://www.themealdb.com/meal/' + m.idMeal,
}));
const ingredients = top.flatMap(({ m, ings }) => ings.map((x) => ({ recipe: m.strMeal, item: x.item, amount: x.amount, have: have.some((h) => matches(h, x.item)) || (basics && isStaple(x.item)) })));
const texts = top.slice(0, 4).map(({ m }) => '### ' + m.strMeal + '\n' + String(m.strInstructions || '').replace(/\r/g, '').slice(0, 2500)).join('\n\n');
return { recipes, ingredients, texts, count: recipes.length };`,
          outputs: [
            { id: 'recipes', label: 'Recipes', type: 'table', columns: RECIPE_COLS },
            { id: 'ingredients', label: 'Ingredients', type: 'table', columns: INGREDIENT_COLS },
            { id: 'texts', label: 'Their methods', type: 'markdown' },
            { id: 'count', label: 'How many', type: 'number' },
          ],
          failed: 'agent',
        },
        {
          id: 'timing',
          title: 'Time the steps',
          do: 'model',
          instructions: `{{#rank.texts}}Split each recipe's method below into short steps, in order, each with the minutes it takes (waiting time included: baking, simmering, resting). Then each recipe's total minutes and how hard it is (Easy, Medium or Hard).

{{rank.texts}}
{{/rank.texts}}{{^rank.texts}}No recipe in the database uses what they have. Make up two simple, good recipes from it (salt, oil and spices may be used), each split into short steps with minutes, its total minutes and how hard it is (Easy, Medium or Hard).
{{/rank.texts}}
What they have: {{items.have}}
Diet: {{diet}}. Time to cook: {{time}}.

- steps: every recipe's steps: the recipe's name exactly as above, the step's number, what to do (one sentence) and its minutes.
- totals: each recipe's name, its total minutes and how hard it is.
- tip: one tip for using up what they have.`,
          outputs: [
            { id: 'steps', label: 'Steps', type: 'table', required: true, columns: [{ id: 'recipe', label: 'Recipe', type: 'text' }, { id: 'n', label: 'Step', type: 'number' }, { id: 'step', label: 'What to do', type: 'text' }, { id: 'minutes', label: 'Minutes', type: 'number' }] },
            { id: 'totals', label: 'Totals', type: 'table', required: true, columns: [{ id: 'recipe', label: 'Recipe', type: 'text' }, { id: 'minutes', label: 'Minutes', type: 'number' }, { id: 'difficulty', label: 'How hard', type: 'text' }] },
            { id: 'tip', label: 'Tip', type: 'text' },
          ],
        },
        {
          id: 'assemble',
          title: 'Put the recipes together',
          do: 'code',
          language: 'javascript',
          with: { recipes: '{{rank.recipes}}', totals: '{{timing.totals}}', steps: '{{timing.steps}}', time: '{{time}}', have: '{{items.have}}' },
          code:
            LIST +
            String.raw`// Each recipe with its minutes and how hard it is, and whether it fits the time you have: those that do first; the
// recipes the model made up when the database had none; the steps of each in order; what to buy for the first three.
const low = (s) => String(s || '').toLowerCase().trim();
const totals = rows(input.totals);
const limit = input.time === 'Under 30 minutes' ? 30 : input.time === 'Under an hour' ? 60 : Infinity;
let recipes = rows(input.recipes);
if (!recipes.length)
  recipes = totals.map((t) => ({ name: String(t.recipe || 'An idea'), picture: null, area: '', minutes: null, difficulty: '', uses: list(input.have).length, missing: 0, uses_list: list(input.have).join(', '), missing_list: '', fits: null, video: null, link: null }));
recipes = recipes.map((r, i) => {
  const t = totals.find((x) => low(x.recipe) === low(r.name)) || totals.find((x) => low(x.recipe).includes(low(r.name)) || low(r.name).includes(low(x.recipe))) || {};
  const minutes = num(t.minutes);
  return { ...r, minutes, difficulty: String(t.difficulty || ''), fits: minutes === null ? true : minutes <= limit, at: i };
});
recipes.sort((a, b) => Number(b.fits) - Number(a.fits) || a.at - b.at);
recipes = recipes.map(({ at, ...r }) => r);
const steps = rows(input.steps)
  .filter((s) => s.step)
  .map((s) => ({ recipe: String(s.recipe || ''), n: num(s.n), step: String(s.step), minutes: num(s.minutes) }));
const shopping = [...new Set(recipes.slice(0, 3).flatMap((r) => String(r.missing_list || '').split(', ').filter(Boolean)))];
const best = recipes[0];
const summary = !best
  ? 'Nothing came up for these: try naming a main thing, like chicken, eggs or chickpeas.'
  : rows(input.recipes).length
    ? recipes.length + (recipes.length === 1 ? ' recipe uses' : ' recipes use') + ' what you have. ' + best.name + ' uses ' + best.uses + ' of your things' + (best.missing ? ' and needs ' + best.missing + ' more' : ' and needs nothing else') + '.'
    : 'No recipe in the database uses these, so here are ideas made from them.';
return { recipes, steps, shopping, summary };`,
          outputs: [
            { id: 'recipes', label: 'Recipes', type: 'table', columns: RECIPE_COLS },
            { id: 'steps', label: 'Steps', type: 'table', columns: STEP_COLS },
            { id: 'shopping', label: 'What to buy', type: 'list' },
            { id: 'summary', label: 'In short', type: 'text' },
          ],
          failed: 'agent',
        },
      ],
      outputs: { summary: '{{assemble.summary}}', recipes: '{{assemble.recipes}}', steps: '{{assemble.steps}}', ingredients: '{{rank.ingredients}}', shopping: '{{assemble.shopping}}', tip: '{{timing.tip}}' },
    },
    answer: [
      { id: 'summary', label: 'In short', type: 'text', required: true },
      { id: 'recipes', label: 'Recipes', type: 'table', required: true, columns: RECIPE_COLS },
      { id: 'steps', label: 'Steps', type: 'table', columns: STEP_COLS },
      { id: 'ingredients', label: 'Ingredients', type: 'table', columns: INGREDIENT_COLS },
      { id: 'shopping', label: 'What to buy', type: 'list' },
      { id: 'tip', label: 'Tip', type: 'text' },
    ],
    examples: [
      { id: 'chicken-and-rice', name: 'Chicken and rice', inputs: { have: 'chicken, rice, peppers, garlic, a lemon, eggs' }, checks: ['{{answer.recipes}} is not empty', '{{answer.steps}} is not empty'] },
      { id: 'vegetarian-quick', name: 'Vegetarian, quick', inputs: { have: 'eggs, spinach, potatoes, cheese', diet: 'Vegetarian', time: 'Under 30 minutes' }, checks: ['{{answer.recipes}} is not empty', '{{answer.recipes}} does not contain Chicken'] },
    ],
  },
  {
    id: 'meal-planner',
    name: 'Meal plan and shopping list',
    icon: 'utensils',
    color: 'green',
    category: 'Food',
    description: 'A week of dinners picked for your household and diet, each with its recipe and photo, and one shopping list for all of them, by aisle.',
    fields: [
      { id: 'days', label: 'How many dinners', type: 'number', default: '7' },
      { id: 'people', label: 'For how many people', type: 'number', default: '2' },
      { id: 'diet', label: 'Diet', type: 'choice', options: ['Anything', 'Vegetarian', 'Vegan', 'Pescatarian', 'No pork'], default: 'Anything' },
      { id: 'likes', label: 'Likes and dislikes', type: 'text', placeholder: 'e.g. Loves Mexican food, no mushrooms, quick on weekdays' },
      { id: 'start', label: 'Starting on', type: 'date', help: 'Today, unless you say' },
    ],
    prompt: '',
    flow: {
      steps: [
        {
          id: 'plan',
          title: 'Plan the week',
          do: 'code',
          language: 'javascript',
          with: { days: '{{days}}', diet: '{{diet}}', start: '{{start}}', today: '{{today}}' },
          code: String.raw`// The days of the plan (two weeks at most), each with its date and weekday, and the kinds of recipe to choose from for the diet.
const n = Math.min(14, Math.max(1, Math.round(Number(input.days) || 7)));
const from = /^\d{4}-\d{2}-\d{2}$/.test(String(input.start || '')) ? input.start : String(input.today || '').slice(0, 10);
const start = new Date(from + 'T00:00:00Z');
if (isNaN(start.getTime())) throw new Error('The first day should be a date, like 2026-11-20');
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dates = [];
for (let i = 0; i < n; i++) {
  const d = new Date(start.getTime() + i * 86400000);
  dates.push({ day: i + 1, date: d.toISOString().slice(0, 10), weekday: WEEKDAYS[d.getUTCDay()] });
}
const KINDS = {
  Vegetarian: ['Vegetarian', 'Vegan', 'Pasta', 'Side'],
  Vegan: ['Vegan', 'Vegetarian'],
  Pescatarian: ['Seafood', 'Vegetarian', 'Pasta', 'Vegan'],
  'No pork': ['Chicken', 'Beef', 'Seafood', 'Pasta', 'Vegetarian', 'Lamb'],
};
const kinds = KINDS[input.diet] || ['Chicken', 'Beef', 'Seafood', 'Pasta', 'Vegetarian', 'Pork', 'Lamb'];
return { dates, count: n, kinds: kinds.map((c) => ({ kind: c, url: '${MEALDB}/filter.php?c=' + c })) };`,
          outputs: [
            { id: 'dates', label: 'The days', type: 'table', columns: [{ id: 'day', label: 'Day', type: 'number' }, { id: 'date', label: 'Date', type: 'date' }, { id: 'weekday', label: 'Weekday', type: 'text' }] },
            { id: 'count', label: 'Dinners', type: 'number' },
            { id: 'kinds', label: 'Kinds of recipe', type: 'table', columns: [{ id: 'kind', label: 'Kind', type: 'text' }, { id: 'url', label: 'Address', type: 'url' }] },
          ],
          failed: 'agent',
        },
        { id: 'fetch', title: 'Get recipes of each kind', do: 'repeat', over: '{{plan.kinds}}', atOnce: 4, as: 'kind', steps: [{ id: 'list', title: 'Get the recipes', do: 'tool', tool: 'http_request', with: { url: '{{kind.url}}' }, failed: 'skip' }] },
        {
          id: 'pool',
          title: 'Gather the choices',
          do: 'code',
          language: 'javascript',
          with: { kinds: '{{plan.kinds}}', found: '{{fetch.items}}', likes: '{{likes}}', seed: '{{run.id}}' },
          code:
            LIST +
            BODY +
            String.raw`// The recipes to choose from, numbered: up to sixty, shuffled for each run so each plan differs, taken in turns from
// each kind; those whose names hold something the likes and dislikes rule out ("no mushrooms") are left out.
const kinds = rows(input.kinds);
let h = 2166136261;
for (const c of String(input.seed || 'plan')) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
const rnd = () => {
  h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h >>>= 0) % 100000) / 100000;
};
const no = [...String(input.likes || '').toLowerCase().matchAll(/\b(?:no|not|without|hates?|avoid|dislikes?)\s+([a-z]+)/g)].map((m) => m[1].replace(/s$/, ''));
const per = list(input.found).map((r, i) => {
  const meals = ((bodyOf(r) || {}).meals || []).filter((m) => !no.some((w) => String(m.strMeal).toLowerCase().includes(w)));
  for (let j = meals.length - 1; j > 0; j--) {
    const k = Math.floor(rnd() * (j + 1));
    [meals[j], meals[k]] = [meals[k], meals[j]];
  }
  return meals.map((m) => ({ id: m.idMeal, meal: m.strMeal, kind: kinds[i] ? kinds[i].kind : '' }));
});
const items = [];
const seen = new Set();
for (let turn = 0; items.length < 60 && per.some((p) => p.length > turn); turn++)
  for (const p of per) {
    const m = p[turn];
    if (m && !seen.has(m.id) && items.length < 60) {
      seen.add(m.id);
      items.push({ n: items.length + 1, ...m });
    }
  }
if (!items.length) throw new Error('The recipe database did not answer: try again in a minute');
return { items, count: items.length };`,
          outputs: [
            { id: 'items', label: 'Choices', type: 'table', columns: [{ id: 'n', label: 'Number', type: 'number' }, { id: 'id', label: 'Its number in the database', type: 'text' }, { id: 'meal', label: 'Dinner', type: 'text' }, { id: 'kind', label: 'Kind', type: 'text' }] },
            { id: 'count', label: 'How many', type: 'number' },
          ],
          failed: 'agent',
        },
        {
          id: 'choose',
          title: 'Choose the dinners',
          do: 'model',
          instructions: `Choose {{plan.count}} dinners for {{people}} people from the numbered recipes below, one for each day in order, so the week is varied (not the same main ingredient two days running, a mix of cuisines, something lighter after something rich).
Diet: {{diet}}.{{#likes}} Likes and dislikes: {{likes}}.{{/likes}}
The days: {{plan.dates}}

{{pool.items}}

- picks: one row per day, in order: the recipe's number from the list (n) and why it suits that day, in a few words.
- overview: the week in one or two sentences.
- tips: three or four tips: what to prepare ahead, what to cook double and eat again, what keeps.`,
          outputs: [
            { id: 'picks', label: 'Picks', type: 'table', required: true, columns: [{ id: 'n', label: 'Number', type: 'number' }, { id: 'why', label: 'Why', type: 'text' }] },
            { id: 'overview', label: 'The week', type: 'text' },
            { id: 'tips', label: 'Tips', type: 'list' },
          ],
        },
        {
          id: 'picked',
          title: 'Check the picks',
          do: 'code',
          language: 'javascript',
          with: { picks: '{{choose.picks}}', pool: '{{pool.items}}', count: '{{plan.count}}' },
          code:
            LIST +
            String.raw`// The recipes picked, each once and from the list; the days left without one get the next in the list.
const pool = rows(input.pool);
const want = Math.max(1, Number(input.count) || 7);
const used = new Set();
const items = [];
for (const p of rows(input.picks)) {
  const m = pool.find((x) => Number(x.n) === Number(p.n));
  if (m && !used.has(m.id) && items.length < want) {
    used.add(m.id);
    items.push({ id: m.id, why: String(p.why || ''), url: '${MEALDB}/lookup.php?i=' + m.id });
  }
}
for (const m of pool) {
  if (items.length >= want) break;
  if (!used.has(m.id)) {
    used.add(m.id);
    items.push({ id: m.id, why: '', url: '${MEALDB}/lookup.php?i=' + m.id });
  }
}
return { items, count: items.length };`,
          outputs: [
            { id: 'items', label: 'Dinners', type: 'table', columns: [{ id: 'id', label: 'Its number in the database', type: 'text' }, { id: 'why', label: 'Why', type: 'text' }, { id: 'url', label: 'Address', type: 'url' }] },
            { id: 'count', label: 'How many', type: 'number' },
          ],
          failed: 'agent',
        },
        { id: 'details', title: 'Get each recipe', do: 'repeat', over: '{{picked.items}}', atOnce: 4, as: 'meal', steps: [{ id: 'recipe', title: 'Get the recipe', do: 'tool', tool: 'http_request', with: { url: '{{meal.url}}' }, failed: 'skip' }] },
        {
          id: 'assemble',
          title: 'Write the plan and the list',
          do: 'code',
          language: 'javascript',
          with: { found: '{{details.items}}', picked: '{{picked.items}}', dates: '{{plan.dates}}', diet: '{{diet}}' },
          code:
            LIST +
            BODY +
            KITCHEN +
            String.raw`// The dinners on their days, each with its ingredients and method; and one shopping list for all of them: the same
// thing once (its amounts added up where their units agree), by aisle, the basics marked as probably there already.
const dates = rows(input.dates);
const picked = rows(input.picked);
const meals = list(input.found).map((r) => ((bodyOf(r) || {}).meals || [])[0] || null);
const days = [];
meals.forEach((m, i) => {
  if (!m || days.length >= dates.length) return;
  const ings = ingredientsOf(m);
  const d = dates[days.length];
  days.push({
    day: d.day,
    date: d.date,
    meal: m.strMeal,
    picture: linkOf(m.strMealThumb),
    area: m.strArea || m.strCountry || '',
    category: m.strCategory || '',
    why: picked[i] ? picked[i].why : '',
    ingredients: ings.map((x) => (x.amount ? x.amount + ' ' : '') + x.item).join('\n'),
    method: String(m.strInstructions || '').replace(/\r/g, '').trim(),
    video: linkOf(m.strYoutube),
    link: linkOf(m.strSource) || 'https://www.themealdb.com/meal/' + m.idMeal,
    ings,
    fits: suits(input.diet, m.strCategory, ings.map((x) => x.item)),
  });
});
const AISLES = [
  ['Meat and fish', MEAT],
  ['Meat and fish', FISH],
  ['Dairy and eggs', /\b(eggs?|milk|cheese|butter|cream|yogh?urt|parmesan|mozzarella|cheddar|feta|ricotta|creme fraiche|ghee)\b/i],
  ['Fruit and vegetables', /\b(onions?|shallots?|garlic|tomato(es)?|peppers?|chill(i|ies)|carrots?|potato(es)?|lettuce|spinach|kale|cabbage|broccoli|cauliflower|celery|cucumber|courgettes?|zucchini|aubergines?|eggplant|mushrooms?|leeks?|spring onions?|scallions?|peas|green beans|beansprouts|avocados?|lemons?|limes?|oranges?|apples?|bananas?|berries|parsley|coriander leaves|cilantro|basil|mint|dill|rosemary|ginger|squash|pumpkin|sweet potato(es)?|beetroot|asparagus|corn)\b/i],
  ['Bread, pasta and rice', /\b(bread|rolls?|buns?|tortillas?|pitta|pita|naan|pasta|spaghetti|penne|fusilli|linguine|tagliatelle|lasagne|macaroni|noodles|rice|couscous|bulgur|quinoa|oats|breadcrumbs)\b/i],
  ['Tins and jars', /\b(tinned|canned|chopped tomatoes|tomato (puree|paste|sauce)|passata|kidney beans|black beans|chickpeas|lentils|coconut milk|stock|broth|soy sauce|fish sauce|worcestershire|ketchup|mustard|mayonnaise|honey|jam|olives|capers|vinegar|oil|tahini|peanut butter|sauce)\b/i],
  ['Herbs and spices', /\b(salt|pepper|paprika|cumin|oregano|thyme|cinnamon|turmeric|curry|garam masala|nutmeg|cloves|cardamom|bay|chilli powder|chili powder|seeds|spice)\b/i],
  ['Baking', /\b(flour|sugar|baking powder|bicarbonate|yeast|vanilla|cocoa|chocolate)\b/i],
];
const aisleOf = (item) => (AISLES.find(([, re]) => re.test(item)) || ['Other'])[0];
// An amount as a number and a unit where it reads so ("200g", "2 tbsp", "1/2 cup"), the units of weight and volume as grams and millilitres.
const UNITS = { g: ['g', 1], gram: ['g', 1], grams: ['g', 1], kg: ['g', 1000], ml: ['ml', 1], l: ['ml', 1000], litre: ['ml', 1000], liter: ['ml', 1000], tbsp: ['tbsp', 1], tablespoon: ['tbsp', 1], tablespoons: ['tbsp', 1], tbs: ['tbsp', 1], tsp: ['tsp', 1], teaspoon: ['tsp', 1], teaspoons: ['tsp', 1], cup: ['cup', 1], cups: ['cup', 1], oz: ['oz', 1], lb: ['lb', 1], lbs: ['lb', 1], clove: ['clove', 1], cloves: ['clove', 1] };
const FRACTION = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
function amountOf(s) {
  const t = String(s || '').trim().toLowerCase().replace(/[½¼¾⅓⅔]/g, (c) => ' ' + FRACTION[c]);
  const m = /^(\d+(?:\.\d+)?)(?:\s+(\d+)\s*\/\s*(\d+)|\s*\/\s*(\d+)|\s+(0\.\d+))?\s*([a-z]+)?/.exec(t.trim());
  if (!m) return null;
  let n = Number(m[1]);
  if (m[2]) n += Number(m[2]) / Number(m[3]);
  else if (m[4]) n = n / Number(m[4]);
  else if (m[5]) n += Number(m[5]);
  const u = m[6] ? UNITS[m[6]] : ['', 1];
  if (m[6] && !u) return null;
  return { n: n * u[1], unit: u[0] };
}
const shown = (n, unit) => {
  const big = unit === 'g' && n >= 1000 ? [n / 1000, 'kg'] : unit === 'ml' && n >= 1000 ? [n / 1000, 'l'] : [n, unit];
  return Math.round(big[0] * 100) / 100 + (big[1] ? ' ' + big[1] : '');
};
const list2 = new Map();
for (const d of days)
  for (const x of d.ings) {
    const key = words(x.item).join(' ') || x.item.toLowerCase();
    const e = list2.get(key) || { item: x.item, sums: {}, other: [], meals: new Set() };
    const a = amountOf(x.amount);
    if (a) e.sums[a.unit] = (e.sums[a.unit] || 0) + a.n;
    else if (x.amount) e.other.push(x.amount);
    e.meals.add(d.meal);
    list2.set(key, e);
  }
const ORDER = ['Fruit and vegetables', 'Meat and fish', 'Dairy and eggs', 'Bread, pasta and rice', 'Tins and jars', 'Herbs and spices', 'Baking', 'Other'];
const shopping = [...list2.values()]
  .map((e) => ({
    item: e.item,
    amount: [...Object.entries(e.sums).map(([u, n]) => shown(n, u)), ...e.other].join(' + '),
    aisle: aisleOf(e.item),
    meals: [...e.meals].join(', '),
    staple: isStaple(e.item),
  }))
  .sort((a, b) => Number(a.staple) - Number(b.staple) || ORDER.indexOf(a.aisle) - ORDER.indexOf(b.aisle) || a.item.localeCompare(b.item));
return { days: days.map(({ ings, fits, ...d }) => d), shopping, count: days.length, off: days.filter((d) => !d.fits).map((d) => d.meal) };`,
          outputs: [
            { id: 'days', label: 'Dinners', type: 'table', columns: DINNER_COLS },
            { id: 'shopping', label: 'Shopping list', type: 'table', columns: SHOP_COLS },
            { id: 'count', label: 'Dinners planned', type: 'number' },
            { id: 'off', label: 'Not quite the diet', type: 'list' },
          ],
          failed: 'agent',
        },
      ],
      outputs: { overview: '{{choose.overview}}', days: '{{assemble.days}}', shopping: '{{assemble.shopping}}', tips: '{{choose.tips}}' },
    },
    answer: [
      { id: 'overview', label: 'The week', type: 'text', required: true },
      { id: 'days', label: 'Dinners', type: 'table', required: true, columns: DINNER_COLS },
      { id: 'shopping', label: 'Shopping list', type: 'table', required: true, columns: SHOP_COLS },
      { id: 'tips', label: 'Tips', type: 'list' },
    ],
    examples: [
      { id: 'a-week-for-two', name: 'A week for two', inputs: { days: 7, people: 2 }, checks: ['{{assemble.count}} = 7', '{{answer.shopping}} is not empty'] },
      { id: 'vegetarian-family', name: 'Vegetarian, for a family', inputs: { days: 5, people: 4, diet: 'Vegetarian', likes: 'Kids like pasta, no mushrooms' }, checks: ['{{assemble.count}} = 5', '{{assemble.off}} is empty'] },
    ],
  },
  // ---- shopping --------------------------------------------------------------------------------------------------
  {
    id: 'gift-ideas',
    name: 'Gift ideas',
    icon: 'gift',
    color: 'pink',
    category: 'Shopping',
    description: 'Thoughtful gifts for someone, within your budget: why each suits them, things and experiences, with one you can buy now, its price and where.',
    fields: [
      { id: 'who', label: 'Who it’s for', type: 'long', required: true, placeholder: 'e.g. My dad, 65, loves gardening and jazz, has everything' },
      { id: 'occasion', label: 'Occasion', type: 'text', placeholder: 'e.g. A birthday, a thank-you, Christmas' },
      { id: 'budget', label: 'Budget', type: 'text', placeholder: 'e.g. €50, or under $100' },
      { id: 'region', label: 'Where you’ll buy', type: 'text', placeholder: 'e.g. the UK, or online' },
    ],
    prompt: '',
    flow: {
      steps: [
        {
          id: 'ideas',
          title: 'Think of gifts',
          do: 'model',
          instructions: `Think of eight gift ideas for this person: varied (things, experiences, something handmade or personal, a treat, a subscription), each one they would really use or remember, none generic.

Who: {{who}}
{{#occasion}}Occasion: {{occasion}}
{{/occasion}}{{#budget}}Budget: {{budget}}
{{/budget}}{{#region}}Buying in: {{region}}
{{/region}}
- ideas: each idea in a few words, its kind (Thing, Experience, Handmade, Treat or Subscription), why it suits them in a sentence, a usual price range as two numbers (low and high, in the budget's currency), and a web search that finds one to buy.
- currency: the budget's currency as a symbol or code (€, $, £…).
- approach: the thinking behind the ideas, in a sentence.`,
          outputs: [
            { id: 'ideas', label: 'Ideas', type: 'table', required: true, columns: [{ id: 'idea', label: 'Idea', type: 'text' }, { id: 'kind', label: 'Kind', type: 'text' }, { id: 'why', label: 'Why', type: 'text' }, { id: 'low', label: 'From', type: 'number' }, { id: 'high', label: 'To', type: 'number' }, { id: 'query', label: 'Search', type: 'text' }] },
            { id: 'currency', label: 'Currency', type: 'text' },
            { id: 'approach', label: 'The thinking', type: 'text' },
          ],
        },
        { id: 'search', title: 'Search for each', do: 'repeat', over: '{{ideas.ideas}}', atOnce: 4, as: 'idea', steps: [{ id: 'shops', title: 'Search the shops', do: 'tool', tool: 'web_search', with: { query: '{{idea.query}} {{region}} price', k: 5 }, failed: 'skip' }] },
        {
          id: 'found',
          title: 'Line up what was found',
          do: 'code',
          language: 'javascript',
          with: { ideas: '{{ideas.ideas}}', found: '{{search.items}}' },
          code:
            LIST +
            HITS +
            String.raw`// Each idea with the first results of its search, numbered, for a model to pick one to buy from.
const found = list(input.found);
const text = rows(input.ideas)
  .map((x, i) => '### ' + (i + 1) + '. ' + x.idea + '\n' + (hitsOf(found[i]).slice(0, 4).map((h) => '- ' + h.title + ' (' + siteOf(h.url) + ') ' + h.url + (h.snippet ? ': ' + h.snippet.slice(0, 220) : '')).join('\n') || '- Nothing found'))
  .join('\n\n');
return { text };`,
          outputs: [{ id: 'text', label: 'What was found', type: 'markdown' }],
          failed: 'agent',
        },
        {
          id: 'prices',
          title: 'Pick one to buy for each',
          do: 'model',
          instructions: `For each numbered gift idea below, pick one real product or offer from its search results that someone could buy now{{#region}} in {{region}}{{/region}}: its name, its price as a number when the results give one, the shop, and its address as written in the results. Leave them empty for an idea whose results show nothing to buy.

{{found.text}}`,
          outputs: [{ id: 'picks', label: 'Picks', type: 'table', columns: [{ id: 'n', label: 'Idea', type: 'number' }, { id: 'example', label: 'One to buy', type: 'text' }, { id: 'price', label: 'Price', type: 'number' }, { id: 'shop', label: 'Shop', type: 'text' }, { id: 'link', label: 'Address', type: 'text' }] }],
        },
        {
          id: 'shown',
          title: 'Choose what to picture',
          do: 'code',
          language: 'javascript',
          with: { ideas: '{{ideas.ideas}}', picks: '{{prices.picks}}' },
          code:
            LIST +
            String.raw`// What each idea's picture shows: the one to buy, with its own page, when there is one; else the idea.
const picks = rows(input.picks);
const link = (v) => (/^https?:\/\/\S+$/.test(String(v || '').trim()) ? String(v).trim() : null);
const items = rows(input.ideas).map((x, i) => {
  const p = picks.find((q) => Number(q.n) === i + 1) || {};
  return { name: String(p.example || '').trim() || String(x.idea || '').trim(), page: link(p.link) };
});
return { items };`,
          outputs: [{ id: 'items', label: 'Pictures to find', type: 'table', columns: [{ id: 'name', label: 'Of', type: 'text' }, { id: 'page', label: 'Its page', type: 'url' }] }],
          failed: 'agent',
        },
        { id: 'media', title: 'Find their pictures', do: 'tool', tool: 'find_media', with: { items: '{{shown.items}}', name: 'name', page: 'page', kind: 'gift' }, failed: 'skip' },
        {
          id: 'merge',
          title: 'Weigh them against the budget',
          do: 'code',
          language: 'javascript',
          with: { ideas: '{{ideas.ideas}}', picks: '{{prices.picks}}', media: '{{media.data}}', budget: '{{budget}}', approach: '{{ideas.approach}}' },
          code:
            LIST +
            String.raw`// Each idea with one to buy and its picture, and whether it fits the budget (the first number in it): those that do first.
const budget = num((/\d[\d.,]*/.exec(String(input.budget || '')) || [''])[0].replace(/,(?=\d{3}\b)/g, ''));
const picks = rows(input.picks);
const media = list(input.media && input.media.items);
const link = (v) => (/^https?:\/\/\S+$/.test(String(v || '').trim()) ? String(v).trim() : null);
const ideas = rows(input.ideas).map((x, i) => {
  const p = picks.find((q) => Number(q.n) === i + 1) || {};
  const m = media[i] && typeof media[i] === 'object' ? media[i] : {};
  const low = num(x.low);
  const high = num(x.high);
  const price = num(p.price);
  const cost = price !== null ? price : low;
  return { idea: String(x.idea || ''), kind: String(x.kind || ''), why: String(x.why || ''), low, high, example: String(p.example || ''), price, shop: String(p.shop || ''), link: link(p.link), fits: budget === null || cost === null ? true : cost <= budget * 1.05, picture: link(m.picture), at: i };
});
ideas.sort((a, b) => Number(b.fits) - Number(a.fits) || a.at - b.at);
const fit = ideas.filter((x) => x.fits).length;
return { ideas: ideas.map(({ at, ...x }) => x), budget, summary: String(input.approach || '').trim() + (budget !== null ? ' ' + fit + ' of ' + ideas.length + ' ideas fit the budget.' : '') };`,
          outputs: [
            { id: 'ideas', label: 'Ideas', type: 'table', columns: GIFT_COLS },
            { id: 'budget', label: 'Budget', type: 'number' },
            { id: 'summary', label: 'In short', type: 'text' },
          ],
          failed: 'agent',
        },
      ],
      outputs: { summary: '{{merge.summary}}', ideas: '{{merge.ideas}}', budget: '{{merge.budget}}', currency: '{{ideas.currency}}' },
    },
    answer: [
      { id: 'summary', label: 'In short', type: 'text', required: true },
      { id: 'ideas', label: 'Ideas', type: 'table', required: true, columns: GIFT_COLS },
      { id: 'budget', label: 'Budget', type: 'number' },
      { id: 'currency', label: 'Currency', type: 'text' },
    ],
    examples: [
      { id: 'a-gardener', name: 'A gardener who has everything', inputs: { who: 'My dad, 65, loves gardening and jazz, has everything', occasion: 'Birthday', budget: '€60' }, checks: ['{{answer.ideas}} is not empty', '{{answer.budget}} = 60', '{{media.data.pictures}} > 0'] },
      { id: 'a-teenager', name: 'A teenager into games', inputs: { who: 'My niece, 15, into video games and drawing', budget: '$40', region: 'the US' }, checks: ['{{answer.ideas}} is not empty'] },
    ],
  },
  // ---- films, shows, games, quizzes, books -----------------------------------------------------------------------
  {
    id: 'what-to-watch',
    name: 'What to watch',
    icon: 'clapperboard',
    color: 'violet',
    category: 'Fun',
    description: 'Films and shows picked for your mood tonight, with where each streams in your country, its rating, its picture and trailer, and why it fits.',
    fields: [
      { id: 'mood', label: 'In the mood for', type: 'text', required: true, placeholder: 'e.g. Something funny and light, or a gripping thriller' },
      { id: 'kind', label: 'Film or show', type: 'choice', options: ['Either', 'A film', 'A show'], default: 'Either' },
      { id: 'services', label: 'Services you have', type: 'text', placeholder: 'e.g. Netflix, Prime Video, Disney+' },
      { id: 'country', label: 'Country', type: 'text', placeholder: 'e.g. United Kingdom' },
      { id: 'seen', label: 'Loved lately, or seen already', type: 'long', placeholder: 'e.g. Loved Severance and Knives Out' },
    ],
    prompt: '',
    flow: {
      steps: [
        { id: 'fresh', title: 'Search what is new', do: 'tool', tool: 'web_search', with: { query: 'best new {{kind}} to stream {{services}} {{mood}} {{today}}', k: 8 }, failed: 'skip' },
        {
          id: 'pick',
          title: 'Pick some to watch',
          do: 'model',
          instructions: `Pick six things to watch tonight for someone in the mood for: {{mood}}. {{#kind}}Kind: {{kind}}. {{/kind}}{{#seen}}They loved or have seen: {{seen}} (pick none of those). {{/seen}}{{#services}}Their services: {{services}}. {{/services}}Mix newer things (the results below show what is new) with proven ones. Today is {{today}}.

{{fresh.text}}

- picks: each its title as it is known in English, its year, Film or Show, its genre, its length in minutes (an episode's, for a show), and why it fits tonight in a sentence.`,
          outputs: [{ id: 'picks', label: 'Picks', type: 'table', required: true, columns: [{ id: 'title', label: 'Title', type: 'text' }, { id: 'year', label: 'Year', type: 'number' }, { id: 'kind', label: 'Film or show', type: 'text' }, { id: 'genre', label: 'Genre', type: 'text' }, { id: 'minutes', label: 'Minutes', type: 'number' }, { id: 'why', label: 'Why', type: 'text' }] }],
        },
        {
          id: 'urls',
          title: 'Plan the look-ups',
          do: 'code',
          language: 'javascript',
          with: { picks: '{{pick.picks}}', country: '{{country}}' },
          code:
            LIST +
            String.raw`// For each pick: where to find more about it (TVmaze for a show, Wikipedia for a film) and the search for where it streams;
// and its title with its year in brackets, which finds its own trailer and not another's of the same name.
const picks = rows(input.picks).slice(0, 6);
const items = picks.map((p) => {
  const show = /show|series/i.test(String(p.kind || ''));
  const title = String(p.title || '').trim();
  const info = show
    ? 'https://api.tvmaze.com/singlesearch/shows?q=' + encodeURIComponent(title)
    : 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrlimit=1&prop=pageimages|description|info&inprop=url&piprop=thumbnail&pithumbsize=400&gsrsearch=' + encodeURIComponent(title + ' ' + (p.year || '') + ' film');
  return { title, show, info, query: title + ' ' + (p.year || '') + ' where to watch streaming ' + String(input.country || '') };
});
const names = picks.map((p) => {
  const title = String(p.title || '').trim();
  return title && num(p.year) ? title + ' (' + num(p.year) + ')' : title;
});
const shows = items.filter((x) => x.show).length;
return { items, names, kind: shows && shows === items.length ? 'TV series' : shows ? 'film or TV series' : 'film' };`,
          outputs: [
            { id: 'items', label: 'Look-ups', type: 'table', columns: [{ id: 'title', label: 'Title', type: 'text' }, { id: 'show', label: 'A show', type: 'yesno' }, { id: 'info', label: 'Where to find more', type: 'url' }, { id: 'query', label: 'Search', type: 'text' }] },
            { id: 'names', label: 'Titles and years', type: 'list' },
            { id: 'kind', label: 'What they are', type: 'text' },
          ],
          failed: 'agent',
        },
        { id: 'media', title: 'Find their trailers', do: 'tool', tool: 'find_media', with: { items: '{{urls.names}}', kind: '{{urls.kind}}', pictures: false, videos: 'official trailer' }, failed: 'skip' },
        {
          id: 'look',
          title: 'Look each one up',
          do: 'repeat',
          over: '{{urls.items}}',
          atOnce: 3,
          as: 'it',
          collect: 'merge',
          steps: [
            { id: 'info', title: 'Find out about it', do: 'tool', tool: 'http_request', with: { url: '{{it.info}}', headers: HEADERS }, failed: 'skip' },
            { id: 'where', title: 'Search where it streams', do: 'tool', tool: 'web_search', with: { query: '{{it.query}}', k: 5 }, failed: 'skip' },
            {
              id: 'merge',
              title: 'Put it together',
              do: 'code',
              language: 'javascript',
              with: { info: '{{info}}', where: '{{where}}', title: '{{it.title}}' },
              code:
                BODY +
                HITS +
                String.raw`// Its picture, rating and channel (from TVmaze) or its picture and page (from Wikipedia), and what the search says of where it streams.
const b = bodyOf(input.info) || {};
const page = b.query && b.query.pages ? b.query.pages[0] || {} : null;
const link = (v) => (/^https?:\/\/\S+$/.test(String(v || '')) ? String(v) : null);
const channel = b.webChannel ? b.webChannel.name : b.network ? b.network.name : '';
return {
  title: input.title,
  picture: page ? link(page.thumbnail && page.thumbnail.source) : link(b.image && (b.image.medium || b.image.original)),
  rating: page ? null : b.rating && b.rating.average ? Number(b.rating.average) : null,
  channel,
  link: page ? link(page.fullurl) : link(b.url),
  where: hitsOf(input.where).slice(0, 5).map((h) => h.title + ' (' + siteOf(h.url) + '): ' + h.snippet.slice(0, 200)).join('\n'),
};`,
              outputs: [
                { id: 'title', label: 'Title', type: 'text' },
                { id: 'picture', label: 'Picture', type: 'url' },
                { id: 'rating', label: 'Rating', type: 'number' },
                { id: 'channel', label: 'Its channel', type: 'text' },
                { id: 'link', label: 'More about it', type: 'url' },
                { id: 'where', label: 'Where it streams, as searched', type: 'text' },
              ],
              failed: 'skip',
            },
          ],
        },
        {
          id: 'streams',
          title: 'Find where each streams',
          do: 'model',
          instructions: `Say where each of these streams in {{#country}}{{country}}{{/country}}{{^country}}the viewer's country{{/country}}, from what was found about it (services like Netflix, Prime Video, Disney+, Max, Apple TV+; or to rent or buy){{#services}}, and whether it is on one of their services: {{services}}{{/services}}. Then pick the one to watch tonight.

{{look.items}}

- where: one row per title, as written above: where it streams, in a few words, and whether it is on their services.
- tonight: the one to watch tonight and why, in a sentence.`,
          outputs: [
            { id: 'where', label: 'Where', type: 'table', columns: [{ id: 'title', label: 'Title', type: 'text' }, { id: 'where', label: 'Where to watch', type: 'text' }, { id: 'on_yours', label: 'On their services', type: 'yesno' }] },
            { id: 'tonight', label: 'Tonight', type: 'text', required: true },
          ],
        },
        {
          id: 'final',
          title: 'Put the picks together',
          do: 'code',
          language: 'javascript',
          with: { picks: '{{pick.picks}}', look: '{{look.items}}', where: '{{streams.where}}', media: '{{media.data}}', services: '{{services}}' },
          code:
            LIST +
            String.raw`// Each pick with its picture, trailer, rating, where it streams and whether that is one of your services: those that are first.
const low = (s) => String(s || '').toLowerCase().trim();
const look = rows(input.look);
const where = rows(input.where);
const media = list(input.media && input.media.items);
const picks = rows(input.picks)
  .slice(0, 6)
  .map((p, i) => {
    const l = look.find((x) => low(x.title) === low(p.title)) || look[i] || {};
    const w = where.find((x) => low(x.title) === low(p.title)) || {};
    const m = media[i] && typeof media[i] === 'object' ? media[i] : {};
    const on = w.on_yours === true || /^(yes|true)$/i.test(String(w.on_yours));
    return { title: String(p.title || ''), year: num(p.year), kind: /show|series/i.test(String(p.kind)) ? 'Show' : 'Film', genre: String(p.genre || ''), minutes: num(p.minutes), rating: num(l.rating), where: String(w.where || l.channel || ''), on_yours: input.services ? on : null, why: String(p.why || ''), picture: l.picture || null, video: m.video || null, link: l.link || null, at: i };
  })
  .sort((a, b) => Number(!!b.on_yours) - Number(!!a.on_yours) || a.at - b.at)
  .map(({ at, ...p }) => p);
return { picks };`,
          outputs: [{ id: 'picks', label: 'Picks', type: 'table', columns: WATCH_COLS }],
          failed: 'agent',
        },
      ],
      outputs: { tonight: '{{streams.tonight}}', picks: '{{final.picks}}' },
    },
    answer: [
      { id: 'tonight', label: 'Tonight', type: 'text', required: true },
      { id: 'picks', label: 'Picks', type: 'table', required: true, columns: WATCH_COLS },
    ],
    examples: [
      { id: 'light-and-funny', name: 'Light and funny', inputs: { mood: 'Something funny and light', services: 'Netflix, Prime Video', country: 'United Kingdom' }, checks: ['{{answer.picks}} is not empty', '{{answer.tonight}} is not empty', '{{media.data.videos}} > 0'] },
      { id: 'a-gripping-show', name: 'A gripping show', inputs: { mood: 'A gripping mystery', kind: 'A show', seen: 'Severance, True Detective' }, checks: ['{{answer.picks}} does not contain Severance'] },
    ],
  },
  {
    id: 'game-finder',
    name: 'Game finder',
    icon: 'gamepad',
    color: 'red',
    category: 'Fun',
    description: 'Games for what you like and where you play, out now or coming soon: each with its picture, its trailer and why it fits, and for PC its best price.',
    fields: [
      { id: 'likes', label: 'What you like', type: 'long', placeholder: 'e.g. Cozy co-op games like Stardew Valley, or tense strategy. Empty: the best of them' },
      { id: 'platform', label: 'Where you play', type: 'choice', options: ['Any', 'PC', 'PlayStation', 'Xbox', 'Nintendo Switch 2', 'Nintendo Switch', 'Phone or tablet'], default: 'Any' },
      { id: 'when', label: 'Out now or coming', type: 'choice', options: ['Out now', 'Coming soon', 'Both'], default: 'Out now' },
      { id: 'budget', label: 'Budget', type: 'choice', options: ['Any price', 'Free to play', 'Under 20'], default: 'Any price' },
    ],
    prompt: '',
    flow: {
      steps: [
        {
          id: 'ask',
          title: 'Word the searches',
          do: 'code',
          language: 'javascript',
          with: { likes: '{{likes}}', platform: '{{platform}}', when: '{{when}}', today: '{{today}}' },
          code: String.raw`// What to search for: the games out now like these, and those announced and still to come, on that platform; and
// which games to pick, as one rule (a model given the three choices to read took "Coming soon" for "Both").
const on = input.platform && input.platform !== 'Any' ? input.platform + ' ' : '';
const where = input.platform && input.platform !== 'Any' ? ' on ' + input.platform : '';
const likes = String(input.likes || '').replace(/\s+/g, ' ').trim().slice(0, 160);
const year = Number(String(input.today || '').slice(0, 4)) || new Date().getFullYear();
const rule =
  input.when === 'Coming soon'
    ? 'Pick up to eight games still to come' + where + ', announced with a date, a month or a season: none that is out already, none that is only a rumour. The soonest first; fewer is better than one already out.'
    : input.when === 'Both'
      ? 'Pick four games already out' + where + ', then four still to come (announced, the soonest first).'
      : 'Pick eight games already out' + where + ': none still to come.';
return {
  now: (likes ? 'best ' + on + 'games like ' + likes : 'best ' + on + 'games to play right now').trim(),
  coming: ('upcoming ' + on + 'games ' + (likes ? likes + ' ' : '') + 'release dates ' + year + ' ' + (year + 1)).trim(),
  rule,
};`,
          outputs: [
            { id: 'now', label: 'Out now', type: 'text' },
            { id: 'coming', label: 'Coming soon', type: 'text' },
            { id: 'rule', label: 'Which games', type: 'text' },
          ],
          failed: 'agent',
        },
        { id: 'scan', title: 'Search for games out now', do: 'tool', tool: 'web_search', if: '{{when}} = Out now or {{when}} = Both', with: { query: '{{ask.now}}', k: 10 }, failed: 'skip' },
        { id: 'coming', title: 'Search for games coming soon', do: 'tool', tool: 'web_search', if: '{{when}} = Coming soon or {{when}} = Both', with: { query: '{{ask.coming}}', k: 12, snippets: 'filtered' }, failed: 'skip' },
        {
          id: 'pick',
          title: 'Pick the games',
          do: 'model',
          instructions: `Games for someone who likes: {{likes}}{{^likes}}anything (they did not say: pick the best and most talked-about){{/likes}}. Where they play: {{platform}}. Budget: {{budget}}. Today is {{today}}.

{{ask.rule}} Good ones, not only the famous ones.

{{scan.text}}

{{coming.text}}

- games: one row each, with
  - title: as its makers write it;
  - year: when it came or comes out;
  - out: for a game still to come, when it comes out, as the sources give it ("12 Nov 2026", "Feb 2027", "Spring 2027"); empty for one out now;
  - coming: true for a game still to come, false for one out now;
  - genre, and platforms: the ones it is on;
  - hours: about how long its main part takes; empty when not known;
  - why: why it fits, in a sentence;
  - free: whether it is free to play.
- summary: the picks in a sentence, for the person who asked (nothing on what the sources leave out).`,
          outputs: [
            {
              id: 'games',
              label: 'Games',
              type: 'table',
              required: true,
              columns: [
                { id: 'title', label: 'Game', type: 'text' },
                { id: 'year', label: 'Year', type: 'number' },
                { id: 'out', label: 'Comes out', type: 'text' },
                { id: 'coming', label: 'Coming soon', type: 'yesno' },
                { id: 'genre', label: 'Genre', type: 'text' },
                { id: 'platforms', label: 'Plays on', type: 'text' },
                { id: 'hours', label: 'Hours', type: 'number' },
                { id: 'why', label: 'Why', type: 'text' },
                { id: 'free', label: 'Free to play', type: 'yesno' },
              ],
            },
            { id: 'summary', label: 'In short', type: 'text', required: true },
          ],
        },
        { id: 'media', title: 'Find their pictures and trailers', do: 'tool', tool: 'find_media', with: { items: '{{pick.games}}', name: 'title', kind: 'video game', videos: 'trailer' }, failed: 'skip' },
        {
          id: 'deals',
          title: 'Check PC prices',
          do: 'repeat',
          if: '{{platform}} = Any or {{platform}} = PC',
          over: '{{pick.games}}',
          atOnce: 3,
          as: 'game',
          steps: [
            {
              id: 'price',
              title: 'Check its price',
              do: 'code',
              language: 'javascript',
              with: { title: '{{game.title}}', coming: '{{game.coming}}' },
              code:
                BODY +
                String.raw`// The game at CheapShark (PC stores): its best price now, the store, and the lowest it has ever been. One still to come has none.
if (input.coming === true || /^(yes|true)$/i.test(String(input.coming))) return { title: input.title, found: false };
const STORES = { 1: 'Steam', 2: 'GamersGate', 3: 'GreenManGaming', 7: 'GOG', 11: 'Humble Store', 13: 'Ubisoft Store', 15: 'Fanatical', 21: 'WinGameStore', 23: 'GameBillet', 25: 'Epic Games Store', 27: 'Gamesplanet', 28: 'Gamesload', 30: 'IndieGala', 35: 'DreamGame' };
const headers = { 'User-Agent': '${UA}' };
const plain = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const found = bodyOf(await ctx.tool('http_request', { url: 'https://www.cheapshark.com/api/1.0/games?limit=5&title=' + encodeURIComponent(input.title), headers }, { title: 'Find it at CheapShark' })) || [];
const g = found.find((x) => plain(x.external) === plain(input.title)) || found[0];
if (!g) return { title: input.title, found: false };
const d = bodyOf(await ctx.tool('http_request', { url: 'https://www.cheapshark.com/api/1.0/games?id=' + g.gameID, headers }, { title: 'Get its prices' })) || {};
const deals = (d.deals || []).slice().sort((a, b) => Number(a.price) - Number(b.price));
const best = deals[0];
return {
  title: input.title,
  found: true,
  price: best ? Number(best.price) : null,
  store: best ? STORES[best.storeID] || 'Store ' + best.storeID : '',
  deal: best ? 'https://www.cheapshark.com/redirect?dealID=' + best.dealID : null,
  lowest: d.cheapestPriceEver ? Number(d.cheapestPriceEver.price) : null,
  picture: /^https:\/\//.test(String(g.thumb || '')) ? g.thumb : null,
};`,
              outputs: [
                { id: 'title', label: 'Game', type: 'text' },
                { id: 'found', label: 'Found', type: 'yesno' },
                { id: 'price', label: 'Best price now', type: 'number' },
                { id: 'store', label: 'Store', type: 'text' },
                { id: 'deal', label: 'Deal', type: 'url' },
                { id: 'lowest', label: 'Lowest ever', type: 'number' },
                { id: 'picture', label: 'Picture', type: 'url' },
              ],
              failed: 'skip',
            },
          ],
        },
        {
          id: 'final',
          title: 'Put the list together',
          do: 'code',
          language: 'javascript',
          with: { games: '{{pick.games}}', deals: '{{deals.items}}', media: '{{media.data}}', budget: '{{budget}}', summary: '{{pick.summary}}' },
          code:
            LIST +
            String.raw`// Each game with its picture and trailer, and its price where one was found; with a budget, those within it first.
// A note a model may still add on its sources ("(from general knowledge; not in the snippets)", "; one source gives
// another date") is left out: the cards show the fields as they are.
const NOTE = /\b(?:sources?|snippets?|calendars?|unverified|general knowledge|not (?:given|listed|in the))\b/i;
const clean = (v) => {
  const said = String(v || '').trim();
  const kept = said
    .replace(/\s*\([^()]*\)/g, (m) => (NOTE.test(m) ? '' : m))
    .split(/;\s+/)
    .filter((part, i) => i === 0 || !NOTE.test(part))
    .join('; ')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/[;,]\s*$/, '')
    .trim();
  return kept !== said && /[.!?]$/.test(said) && !/[.!?]$/.test(kept) ? kept + '.' : kept;
};
const deals = list(input.deals);
const media = list(input.media && input.media.items);
const yes = (v) => v === true || /^(yes|true)$/i.test(String(v));
const games = rows(input.games).map((g, i) => {
  const d = deals[i] && deals[i].found ? deals[i] : {};
  const m = media[i] && typeof media[i] === 'object' ? media[i] : {};
  const coming = yes(g.coming);
  return {
    title: String(g.title || ''), year: num(g.year), out: coming ? clean(g.out || num(g.year) || '') : '', coming, genre: clean(g.genre), platforms: clean(g.platforms), hours: num(g.hours), why: clean(g.why), free: yes(g.free),
    price: num(d.price), lowest: num(d.lowest), store: String(d.store || ''), deal: d.deal || null, picture: m.picture || d.picture || null, video: m.video || null, at: i,
  };
});
const within = (g) => (input.budget === 'Free to play' ? g.free : input.budget === 'Under 20' ? g.free || g.coming || (g.price !== null && g.price < 20) : true);
games.sort((a, b) => Number(within(b)) - Number(within(a)) || a.at - b.at);
// The picks in their first sentence: what follows it is a model's notes on what the sources lacked.
const said = String(input.summary || '').replace(/\s+/g, ' ').trim();
const first = (/^.*?[.!?](?=\s+[A-Z]|$)/.exec(said) || [said])[0];
return { games: games.map(({ at, ...g }) => g), summary: first.length > 20 ? first : said };`,
          outputs: [
            { id: 'games', label: 'Games', type: 'table', columns: GAME_COLS },
            { id: 'summary', label: 'In short', type: 'text' },
          ],
          failed: 'agent',
        },
      ],
      outputs: { summary: '{{final.summary}}', games: '{{final.games}}' },
    },
    answer: [
      { id: 'summary', label: 'In short', type: 'text', required: true },
      { id: 'games', label: 'Games', type: 'table', required: true, columns: GAME_COLS },
    ],
    examples: [
      { id: 'cozy-co-op', name: 'Cozy co-op on PC', inputs: { likes: 'Cozy co-op games like Stardew Valley', platform: 'PC' }, checks: ['{{answer.games}} is not empty'] },
      { id: 'switch-for-kids', name: 'Switch games for kids', inputs: { likes: 'Fun games for an 8-year-old, no violence', platform: 'Nintendo Switch' }, checks: ['{{answer.games}} is not empty', '{{deals.count}} is empty'] },
      { id: 'coming-to-switch-2', name: 'Coming to Switch 2', inputs: { platform: 'Nintendo Switch 2', when: 'Coming soon' }, checks: ['{{answer.games}} is not empty', '{{scan.text}} is empty'] },
    ],
  },
  {
    id: 'quiz',
    name: 'Quiz on any topic',
    icon: 'lightbulb',
    color: 'amber',
    category: 'Fun',
    description: 'A quiz on any topic to play right on its page: pick your answers, see what you got right with a short explanation, and your score.',
    fields: [
      { id: 'topic', label: 'Topic', type: 'text', required: true, placeholder: 'e.g. The solar system, 90s films, the Roman Empire' },
      { id: 'level', label: 'How hard', type: 'choice', options: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
      { id: 'count', label: 'Questions', type: 'choice', options: ['5', '10', '15'], default: '10' },
      { id: 'players', label: 'Who’s playing', type: 'text', placeholder: 'e.g. Kids aged 10, or a pub quiz team' },
    ],
    prompt: '',
    flow: {
      steps: [
        { id: 'wiki', title: 'Find the topic on Wikipedia', do: 'tool', tool: 'http_request', with: { url: 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&list=search&srlimit=1&srsearch={{topic}}', headers: HEADERS }, failed: 'skip' },
        {
          id: 'page',
          title: 'Pick its page',
          do: 'code',
          language: 'javascript',
          with: { found: '{{wiki}}' },
          code:
            BODY +
            String.raw`// The Wikipedia page that search found first, to read for facts.
const hit = (((bodyOf(input.found) || {}).query || {}).search || [])[0];
return hit ? { title: hit.title, url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(hit.title.replace(/ /g, '_')) } : { title: '', url: null };`,
          outputs: [{ id: 'title', label: 'Its page', type: 'text' }, { id: 'url', label: 'Address', type: 'url' }],
          failed: 'agent',
        },
        { id: 'facts', title: 'Read up on it', do: 'tool', tool: 'read_page', if: '{{page.url}} is not empty', with: { url: '{{page.url}}', question: 'Key facts about {{topic}}: names, dates, numbers, firsts and records' }, failed: 'skip' },
        {
          id: 'write',
          title: 'Write the questions',
          do: 'model',
          instructions: `Write a {{level}} quiz of {{count}} questions on: {{topic}}.{{#players}} For: {{players}}.{{/players}} Use the facts below where you can, and only facts you are sure of; no trick questions; vary them (who, what, when, where, how many).
{{#facts.text}}
Facts ({{page.title}}, Wikipedia):
{{facts.text}}
{{/facts.text}}
- questions: each the question, four answers (a, b, c, d), only one right, the others believable, the right one's letter (A, B, C or D), and why it is right in a sentence.
- intro: two sentences that set up the topic.`,
          outputs: [
            { id: 'questions', label: 'Questions', type: 'table', required: true, columns: [{ id: 'question', label: 'Question', type: 'text' }, { id: 'a', label: 'A', type: 'text' }, { id: 'b', label: 'B', type: 'text' }, { id: 'c', label: 'C', type: 'text' }, { id: 'd', label: 'D', type: 'text' }, { id: 'answer', label: 'Right answer', type: 'text' }, { id: 'explain', label: 'Why', type: 'text' }] },
            { id: 'intro', label: 'About the topic', type: 'text', required: true },
          ],
        },
        {
          id: 'check',
          title: 'Check and shuffle them',
          do: 'code',
          language: 'javascript',
          with: { questions: '{{write.questions}}', seed: '{{run.id}}' },
          code:
            LIST +
            String.raw`// Only questions with four different answers and one right letter; the answers shuffled for each run, so the right
// one is not always in the same place; numbered.
let h = 2166136261;
for (const c of String(input.seed || 'quiz')) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
const rnd = () => {
  h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h >>>= 0) % 100000) / 100000;
};
const L = ['a', 'b', 'c', 'd'];
const questions = [];
for (const q of rows(input.questions)) {
  const opts = L.map((k) => String(q[k] || '').trim());
  const right = L.indexOf(String(q.answer || '').trim().toLowerCase().charAt(0));
  if (!q.question || right < 0 || opts.some((o) => !o) || new Set(opts.map((o) => o.toLowerCase())).size < 4) continue;
  const order = [0, 1, 2, 3];
  for (let j = 3; j > 0; j--) {
    const k = Math.floor(rnd() * (j + 1));
    [order[j], order[k]] = [order[k], order[j]];
  }
  const row = { n: questions.length + 1, question: String(q.question).trim() };
  order.forEach((from, to) => (row[L[to]] = opts[from]));
  row.answer = L[order.indexOf(right)].toUpperCase();
  row.explain = String(q.explain || '').trim();
  questions.push(row);
}
if (!questions.length) throw new Error('The questions did not come out right: try again');
return { questions, count: questions.length };`,
          outputs: [{ id: 'questions', label: 'Questions', type: 'table', columns: QUESTION_COLS }, { id: 'count', label: 'How many', type: 'number' }],
          failed: 'agent',
        },
      ],
      outputs: { title: '{{page.title}}', intro: '{{write.intro}}', questions: '{{check.questions}}', source: '{{page.url}}' },
    },
    answer: [
      { id: 'title', label: 'Read more', type: 'text' },
      { id: 'intro', label: 'About the topic', type: 'text', required: true },
      { id: 'questions', label: 'Questions', type: 'table', required: true, columns: QUESTION_COLS },
      { id: 'source', label: 'Source', type: 'url' },
    ],
    examples: [
      { id: 'the-solar-system', name: 'The solar system, for kids', inputs: { topic: 'The solar system', level: 'Easy', count: '5', players: 'Kids aged 10' }, checks: ['{{check.count}} >= 4'] },
      { id: 'the-roman-empire', name: 'The Roman Empire, hard', inputs: { topic: 'The Roman Empire', level: 'Hard' }, checks: ['{{check.count}} >= 8', '{{answer.source}} contains wikipedia'] },
    ],
  },
  {
    id: 'book-finder',
    name: 'Book finder',
    icon: 'book-open',
    color: 'indigo',
    category: 'Fun',
    description: 'Books you are likely to love, from the ones you did: covers, pages, ratings and why each fits, checked against Open Library.',
    fields: [
      { id: 'likes', label: 'Books you loved, or what you’re after', type: 'long', required: true, placeholder: 'e.g. The Martian, Project Hail Mary; or a cozy mystery set in Japan' },
      { id: 'kind', label: 'Fiction or not', type: 'choice', options: ['Either', 'Fiction', 'Non-fiction'], default: 'Either' },
      { id: 'length', label: 'Length', type: 'choice', options: ['Any length', 'Short (under 250 pages)', 'Long (over 400 pages)'], default: 'Any length' },
      { id: 'read', label: 'Read already', type: 'long', placeholder: 'Titles to leave out' },
    ],
    prompt: '',
    flow: {
      steps: [
        {
          id: 'suggest',
          title: 'Think of books',
          do: 'model',
          instructions: `Suggest ten books for someone who likes: {{likes}}. Kind: {{kind}}. Length: {{length}}.{{#read}} They have read (leave these out): {{read}}.{{/read}} Real books only, a mix of well known and less known, by different authors.

- books: each its title and author exactly as published (in English where it was translated), the year it first came out, its kind (genre), and why they may like it in a sentence.
- summary: the thread that joins them, in a sentence.`,
          outputs: [
            { id: 'books', label: 'Books', type: 'table', required: true, columns: [{ id: 'title', label: 'Book', type: 'text' }, { id: 'author', label: 'Author', type: 'text' }, { id: 'year', label: 'Year', type: 'number' }, { id: 'genre', label: 'Kind', type: 'text' }, { id: 'why', label: 'Why', type: 'text' }] },
            { id: 'summary', label: 'In short', type: 'text', required: true },
          ],
        },
        {
          id: 'urls',
          title: 'Plan the look-ups',
          do: 'code',
          language: 'javascript',
          with: { books: '{{suggest.books}}' },
          code:
            LIST +
            String.raw`// Each book's search at Open Library, by its title and author.
const items = rows(input.books).slice(0, 10).map((b) => ({ title: String(b.title || ''), url: 'https://openlibrary.org/search.json?limit=1&fields=key,title,author_name,first_publish_year,cover_i,number_of_pages_median,ratings_average,ratings_count,subject&title=' + encodeURIComponent(String(b.title || '')) + '&author=' + encodeURIComponent(String(b.author || '')) }));
return { items };`,
          outputs: [{ id: 'items', label: 'Look-ups', type: 'table', columns: [{ id: 'title', label: 'Book', type: 'text' }, { id: 'url', label: 'Address', type: 'url' }] }],
          failed: 'agent',
        },
        { id: 'lookup', title: 'Check each at Open Library', do: 'repeat', over: '{{urls.items}}', atOnce: 4, as: 'book', steps: [{ id: 'found', title: 'Look it up', do: 'tool', tool: 'http_request', with: { url: '{{book.url}}', headers: HEADERS }, failed: 'skip' }] },
        {
          id: 'shelf',
          title: 'Put them on the shelf',
          do: 'code',
          language: 'javascript',
          with: { books: '{{suggest.books}}', found: '{{lookup.items}}', length: '{{length}}' },
          code:
            LIST +
            BODY +
            String.raw`// Each book with what Open Library has of it (its cover, pages, rating, subjects, page): those found first, and those
// of the length asked for before the others.
const found = list(input.found);
const pages = (n) => (input.length === 'Short (under 250 pages)' ? n === null || n < 250 : input.length === 'Long (over 400 pages)' ? n === null || n > 400 : true);
const books = rows(input.books).slice(0, 10).map((b, i) => {
  const d = ((bodyOf(found[i]) || {}).docs || [])[0] || null;
  const p = d ? num(d.number_of_pages_median) : null;
  return {
    title: d ? d.title : String(b.title || ''),
    author: d && d.author_name ? d.author_name.slice(0, 2).join(', ') : String(b.author || ''),
    year: d && d.first_publish_year ? d.first_publish_year : num(b.year),
    pages: p,
    rating: d && d.ratings_average && d.ratings_count >= 5 ? Math.round(d.ratings_average * 10) / 10 : null,
    genre: String(b.genre || ''),
    why: String(b.why || ''),
    cover: d && d.cover_i ? 'https://covers.openlibrary.org/b/id/' + d.cover_i + '-M.jpg' : null,
    link: d ? 'https://openlibrary.org' + d.key : null,
    subjects: d && d.subject ? d.subject.filter((s) => s.length < 30 && !/[:=]/.test(s)).slice(0, 4).join(', ') : '',
    at: i,
    fits: pages(p),
    found: !!d,
  };
});
books.sort((a, b) => Number(b.found) - Number(a.found) || Number(b.fits) - Number(a.fits) || a.at - b.at);
return { books: books.map(({ at, fits, found, ...b }) => b), checked: books.filter((b) => b.found).length };`,
          outputs: [{ id: 'books', label: 'Books', type: 'table', columns: BOOK_COLS }, { id: 'checked', label: 'Found at Open Library', type: 'number' }],
          failed: 'agent',
        },
      ],
      outputs: { summary: '{{suggest.summary}}', books: '{{shelf.books}}' },
    },
    answer: [
      { id: 'summary', label: 'In short', type: 'text', required: true },
      { id: 'books', label: 'Books', type: 'table', required: true, columns: BOOK_COLS },
    ],
    examples: [
      { id: 'like-the-martian', name: 'Like The Martian', inputs: { likes: 'The Martian, Project Hail Mary', kind: 'Fiction' }, checks: ['{{shelf.checked}} >= 6', '{{answer.books}} does not contain The Martian'] },
      { id: 'short-non-fiction', name: 'Short non-fiction on the brain', inputs: { likes: 'Curious, readable books about how the brain works', kind: 'Non-fiction', length: 'Short (under 250 pages)' }, checks: ['{{answer.books}} is not empty'] },
    ],
  },
  // ---- plans -----------------------------------------------------------------------------------------------------
  {
    id: 'whats-on',
    name: 'What’s on',
    icon: 'ticket',
    color: 'pink',
    category: 'Planning',
    description: 'Things to do in a city on the days you pick: concerts, markets, exhibitions and family outings, by day and on a map, with the weather for each day.',
    fields: [
      { id: 'city', label: 'City or town', type: 'text', required: true, placeholder: 'e.g. Lisbon' },
      { id: 'from', label: 'From', type: 'date', help: 'The coming weekend, unless you say' },
      { id: 'to', label: 'To', type: 'date' },
      { id: 'likes', label: 'What you like', type: 'text', placeholder: 'e.g. Live music, food markets, things for kids' },
    ],
    prompt: '',
    flow: {
      steps: [
        {
          id: 'dates',
          title: 'Work out the days',
          do: 'code',
          language: 'javascript',
          with: { from: '{{from}}', to: '{{to}}', today: '{{today}}' },
          code: String.raw`// The days to look at: those asked for, else the coming weekend (this one, from Friday on), a week at most.
const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date(String(input.today || '').slice(0, 10) + 'T00:00:00Z');
let from = /^\d{4}-\d{2}-\d{2}$/.test(String(input.from || '')) ? new Date(input.from + 'T00:00:00Z') : null;
let to = /^\d{4}-\d{2}-\d{2}$/.test(String(input.to || '')) ? new Date(input.to + 'T00:00:00Z') : null;
if (!from) {
  const dow = today.getUTCDay();
  from = new Date(today.getTime() + (dow === 0 ? 0 : dow === 6 ? 0 : dow === 5 ? 0 : 6 - dow) * 86400000);
  if (!to) to = new Date(today.getTime() + (dow === 0 ? 0 : 7 - dow) * 86400000);
}
if (!to || to < from) to = from;
if (to.getTime() - from.getTime() > 6 * 86400000) to = new Date(from.getTime() + 6 * 86400000);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const label = from.getUTCDate() + ' ' + MONTHS[from.getUTCMonth()] + (iso(to) !== iso(from) ? ' to ' + to.getUTCDate() + ' ' + MONTHS[to.getUTCMonth()] : '') + ' ' + to.getUTCFullYear();
return { from: iso(from), to: iso(to), label, month: MONTHS[from.getUTCMonth()] + ' ' + from.getUTCFullYear(), soon: Math.round((to - today) / 86400000) <= 15 };`,
          outputs: [
            { id: 'from', label: 'From', type: 'date' },
            { id: 'to', label: 'To', type: 'date' },
            { id: 'label', label: 'The days', type: 'text' },
            { id: 'month', label: 'Month', type: 'text' },
            { id: 'soon', label: 'Soon enough for a forecast', type: 'yesno' },
          ],
          failed: 'agent',
        },
        { id: 'search', title: 'Look the city up', do: 'tool', tool: 'http_request', with: { url: 'https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json&name={{city}}' }, failed: 'skip' },
        {
          id: 'spot',
          title: 'Pick the city',
          do: 'code',
          language: 'javascript',
          with: { found: '{{search}}', city: '{{city}}', from: '{{dates.from}}', to: '{{dates.to}}', soon: '{{dates.soon}}' },
          code:
            BODY +
            PLACE +
            String.raw`// The city, and the address of its forecast for those days when they are near enough.
const p = await placeOf(input.found, input.city, ctx);
if (!p) throw new Error('No place called “' + input.city + '” was found: check its spelling, or add its country');
const soon = input.soon === true || /^(yes|true)$/i.test(String(input.soon));
const url = soon ? 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lng + '&timezone=auto&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&start_date=' + input.from + '&end_date=' + input.to : '';
return { label: p.label, name: p.name, lat: p.lat, lng: p.lng, at: p.lat + ',' + p.lng, url };`,
          outputs: [
            { id: 'label', label: 'City', type: 'text' },
            { id: 'name', label: 'Its name', type: 'text' },
            { id: 'lat', label: 'Latitude', type: 'number' },
            { id: 'lng', label: 'Longitude', type: 'number' },
            { id: 'at', label: 'Where on a map', type: 'text' },
            { id: 'url', label: 'Its forecast', type: 'text' },
          ],
          failed: 'agent',
        },
        {
          id: 'look',
          title: 'Look for what is on',
          do: 'parallel',
          branches: [
            [{ id: 'events_search', title: 'Search for events', do: 'tool', tool: 'web_search', with: { query: 'events in {{spot.name}} {{dates.label}} {{likes}}', k: 10 }, failed: 'skip' }],
            [{ id: 'guide_search', title: 'Search for listings', do: 'tool', tool: 'web_search', with: { query: 'what’s on in {{spot.name}} this weekend {{dates.month}} things to do', k: 8 }, failed: 'skip' }],
            [{ id: 'weather', title: 'Get the forecast', do: 'tool', tool: 'http_request', if: '{{spot.url}} is not empty', with: { url: '{{spot.url}}' }, failed: 'skip' }],
          ],
        },
        {
          id: 'pages',
          title: 'Pick listings to read',
          do: 'code',
          language: 'javascript',
          with: { a: '{{events_search}}', b: '{{guide_search}}' },
          code:
            HITS +
            String.raw`// Three listing pages to read (event guides and the city's own pages before social media and ticket resellers).
const BAD = /(^|\.)(facebook\.com|instagram\.com|x\.com|twitter\.com|tiktok\.com|youtube\.com|reddit\.com|pinterest\.[a-z.]+|tripadvisor\.[a-z.]+|viagogo\.[a-z.]+|stubhub\.[a-z.]+)$/;
const seen = new Set();
const all = hitsOf(input.a).concat(hitsOf(input.b)).filter((h) => !BAD.test(siteOf(h.url)) && !seen.has(h.url) && seen.add(h.url));
const score = (h) => (/event|what.?s.?on|things to do|agenda|listing|weekend|calendar/i.test(h.title + ' ' + h.url) ? 5 : 0) + (/timeout\.com|eventbrite\.|visit|allevents\.in|songkick\.com|ra\.co|culture/i.test(h.url) ? 3 : 0) - h.rank / 3;
return { items: all.sort((a, b) => score(b) - score(a)).slice(0, 3).map((h) => ({ url: h.url, title: h.title })) };`,
          outputs: [{ id: 'items', label: 'Pages', type: 'table', columns: [{ id: 'url', label: 'Link', type: 'url' }, { id: 'title', label: 'Title', type: 'text' }] }],
          failed: 'agent',
        },
        { id: 'read', title: 'Read the listings', do: 'repeat', over: '{{pages.items}}', atOnce: 3, as: 'page', steps: [{ id: 'listing', title: 'Read a listing', do: 'tool', tool: 'read_page', with: { url: '{{page.url}}', question: 'Events from {{dates.from}} to {{dates.to}}: name, date, time, venue, price' }, failed: 'skip' }] },
        {
          id: 'events',
          title: 'Pick out the events',
          do: 'model',
          instructions: `List what is on in {{spot.label}} from {{dates.from}} to {{dates.to}}, from the listings and results below.{{#likes}} They like: {{likes}}: put those first.{{/likes}} Only events on those days (or running through them), each as the sources give it.

Listings:
{{read.items}}

Search results:
{{events_search.text}}
{{guide_search.text}}

- events: at most twelve: the name, the date it is on (YYYY-MM-DD; the first of those days for something running through them), the time if given, the venue (name, as a map would find it), its kind (Music, Art, Food, Family, Market, Theatre, Sport, Outdoors or Other), the price as given, why go in a few words, and its address.
- summary: the days in two sentences.`,
          outputs: [
            { id: 'events', label: 'Events', type: 'table', columns: [{ id: 'name', label: 'What', type: 'text' }, { id: 'date', label: 'Date', type: 'text' }, { id: 'time', label: 'Time', type: 'text' }, { id: 'venue', label: 'Where', type: 'text' }, { id: 'kind', label: 'Kind', type: 'text' }, { id: 'price', label: 'Price', type: 'text' }, { id: 'why', label: 'Why go', type: 'text' }, { id: 'url', label: 'Address', type: 'text' }] },
            { id: 'summary', label: 'In short', type: 'text', required: true },
          ],
        },
        { id: 'media', title: 'Find their pictures', do: 'tool', tool: 'find_media', with: { items: '{{events.events}}', name: 'name', page: 'url', kind: 'event in {{spot.name}}' }, failed: 'skip' },
        {
          id: 'where',
          title: 'Plan the map',
          do: 'code',
          language: 'javascript',
          with: { events: '{{events.events}}', city: '{{spot.name}}', lat: '{{spot.lat}}', lng: '{{spot.lng}}' },
          code:
            LIST +
            String.raw`// Each venue's search on OpenStreetMap's map (Photon), near the city.
const items = rows(input.events).slice(0, 12).map((e, i) => ({ n: i + 1, url: 'https://photon.komoot.io/api/?limit=1&lat=' + input.lat + '&lon=' + input.lng + '&q=' + encodeURIComponent(String(e.venue || e.name || '') + ' ' + String(input.city || '')) }));
return { items };`,
          outputs: [{ id: 'items', label: 'Venues', type: 'table', columns: [{ id: 'n', label: 'Event', type: 'number' }, { id: 'url', label: 'Address', type: 'url' }] }],
          failed: 'agent',
        },
        { id: 'locate', title: 'Find each venue', do: 'repeat', over: '{{where.items}}', atOnce: 3, as: 'venue', steps: [{ id: 'spot_of', title: 'Find it on the map', do: 'tool', tool: 'http_request', with: { url: '{{venue.url}}', headers: HEADERS }, failed: 'skip' }] },
        {
          id: 'final',
          title: 'Lay out the days',
          do: 'code',
          language: 'javascript',
          with: { events: '{{events.events}}', found: '{{locate.items}}', media: '{{media.data}}', weather: '{{weather}}', from: '{{dates.from}}', to: '{{dates.to}}', lat: '{{spot.lat}}', lng: '{{spot.lng}}' },
          code:
            LIST +
            BODY +
            SKY +
            String.raw`// The events on those days in order, each with its picture, and on the map when its venue was found near the city
// (within 30 km); and each day with its weather.
const found = list(input.found);
const media = list(input.media && input.media.items);
const day = (v) => (/^\d{4}-\d{2}-\d{2}/.exec(String(v || '')) || [''])[0];
const near = (a, b) => Math.hypot((a - Number(input.lat)) * 111, (b - Number(input.lng)) * 111 * Math.cos((Number(input.lat) * Math.PI) / 180)) < 30;
const link = (v) => (/^https?:\/\/\S+$/.test(String(v || '').trim()) ? String(v).trim() : null);
const events = rows(input.events)
  .slice(0, 12)
  .map((e, i) => {
    const f = (((bodyOf(found[i]) || {}).features || [])[0] || {}).geometry;
    const c = f && Array.isArray(f.coordinates) && near(f.coordinates[1], f.coordinates[0]) ? f.coordinates : null;
    const m = media[i] && typeof media[i] === 'object' ? media[i] : {};
    return { name: String(e.name || ''), date: day(e.date) || input.from, time: String(e.time || ''), venue: String(e.venue || ''), kind: String(e.kind || 'Other'), price: String(e.price || ''), why: String(e.why || ''), url: link(e.url), lat: c ? c[1] : null, lng: c ? c[0] : null, picture: link(m.picture) };
  })
  .filter((e) => e.name && e.date >= input.from && e.date <= input.to)
  .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
const w = (bodyOf(input.weather) || {}).daily || {};
const days = [];
for (let d = new Date(input.from + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= input.to; d = new Date(d.getTime() + 86400000)) {
  const k = d.toISOString().slice(0, 10);
  const i = (w.time || []).indexOf(k);
  days.push({ date: k, icon: i >= 0 ? (SKY[w.weather_code[i]] || ['', ''])[1] : '', high: i >= 0 ? w.temperature_2m_max[i] : null, low: i >= 0 ? w.temperature_2m_min[i] : null, chance: i >= 0 ? w.precipitation_probability_max[i] : null, events: events.filter((e) => e.date === k).length });
}
return { events, days, mapped: events.filter((e) => e.lat !== null).length };`,
          outputs: [
            { id: 'events', label: 'Events', type: 'table', columns: EVENT_COLS },
            { id: 'days', label: 'The days', type: 'table', columns: [{ id: 'date', label: 'Date', type: 'date' }, { id: 'icon', label: 'Sky', type: 'text' }, { id: 'high', label: 'High', type: 'number' }, { id: 'low', label: 'Low', type: 'number' }, { id: 'chance', label: 'Chance of rain, %', type: 'number' }, { id: 'events', label: 'Events', type: 'number' }] },
            { id: 'mapped', label: 'On the map', type: 'number' },
          ],
          failed: 'agent',
        },
      ],
      outputs: { city: '{{spot.label}}', at: '{{spot.at}}', when: '{{dates.label}}', summary: '{{events.summary}}', days: '{{final.days}}', events: '{{final.events}}' },
    },
    answer: [
      { id: 'city', label: 'City', type: 'text', required: true },
      { id: 'at', label: 'Where on a map', type: 'text' },
      { id: 'when', label: 'The days', type: 'text' },
      { id: 'summary', label: 'In short', type: 'text', required: true },
      { id: 'days', label: 'The days', type: 'table', columns: [{ id: 'date', label: 'Date', type: 'date' }, { id: 'icon', label: 'Sky', type: 'text' }, { id: 'high', label: 'High', type: 'number' }, { id: 'low', label: 'Low', type: 'number' }, { id: 'chance', label: 'Chance of rain, %', type: 'number' }, { id: 'events', label: 'Events', type: 'number' }] },
      { id: 'events', label: 'Events', type: 'table', required: true, columns: EVENT_COLS },
    ],
    examples: [
      { id: 'lisbon-this-weekend', name: 'Lisbon this weekend', inputs: { city: 'Lisbon', likes: 'Live music and food markets' }, checks: ['{{answer.days}} is not empty', '{{answer.city}} contains Lisbon'] },
      { id: 'set-days', name: 'Set days, for a family', inputs: { city: 'Edinburgh', from: '2027-08-06', to: '2027-08-08', likes: 'Things for kids' }, checks: ['{{dates.from}} = 2027-08-06', '{{dates.to}} = 2027-08-08'] },
    ],
  },
  {
    id: 'savings-plan',
    name: 'Savings plan',
    icon: 'piggy-bank',
    color: 'teal',
    category: 'Planning',
    description: 'How to reach a savings goal by a date: what to put aside each month, the balance growing with interest on a chart, and what saving more or less would change.',
    fields: [
      { id: 'goal', label: 'Saving for', type: 'text', placeholder: 'e.g. A house deposit' },
      { id: 'target', label: 'Amount to reach', type: 'number', required: true, placeholder: 'e.g. 20000' },
      { id: 'by', label: 'By when', type: 'date', required: true },
      { id: 'saved', label: 'Saved already', type: 'number', default: '0' },
      { id: 'monthly', label: 'You can put aside each month', type: 'number', help: 'Leave it empty to see what it takes' },
      { id: 'rate', label: 'Interest a year, %', type: 'number', default: '3' },
      { id: 'currency', label: 'Currency', type: 'text', placeholder: 'e.g. €, $, £' },
    ],
    prompt: '',
    flow: {
      steps: [
        {
          id: 'project',
          title: 'Work out the plan',
          do: 'code',
          language: 'javascript',
          with: { target: '{{target}}', by: '{{by}}', saved: '{{saved}}', monthly: '{{monthly}}', rate: '{{rate}}', today: '{{today}}' },
          code: String.raw`// The months to the date, what it takes each month to get there with the interest added monthly, and the balance month
// by month at what you put aside (or at what it takes); when you would get there at 20% less, as planned and 20% more;
// and the months you pass a quarter, half and three quarters of the goal.
const target = Number(input.target) || 0;
const saved = Math.max(0, Number(input.saved) || 0);
const r = Math.max(0, Number(input.rate) || 0) / 100 / 12;
const today = new Date(String(input.today).slice(0, 10) + 'T00:00:00Z');
const by = new Date(String(input.by).slice(0, 10) + 'T00:00:00Z');
if (!(target > 0)) throw new Error('Give the amount to reach');
if (isNaN(by.getTime()) || by <= today) throw new Error('By when should be a date after today');
const months = Math.max(1, (by.getUTCFullYear() - today.getUTCFullYear()) * 12 + by.getUTCMonth() - today.getUTCMonth());
const grow = Math.pow(1 + r, months);
const needed = Math.max(0, r ? ((target - saved * grow) * r) / (grow - 1) : (target - saved) / months);
const plan = String(input.monthly || '').trim() !== '' ? Math.max(0, Number(input.monthly) || 0) : needed;
const round = (n) => Math.round(n * 100) / 100;
const label = (k) => {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + k, 1));
  return d.toISOString().slice(0, 7);
};
const rows = [];
let bal = saved;
let ontrack = saved;
let put = saved;
for (let k = 1; k <= months; k++) {
  bal = bal * (1 + r) + plan;
  ontrack = ontrack * (1 + r) + needed;
  put += plan;
  rows.push({ month: label(k), put_in: round(put), interest: round(bal - put), balance: round(bal), needed: round(ontrack) });
}
// When a monthly amount gets there: the month the balance first reaches the goal (within 50 years).
const reach = (m) => {
  let b = saved;
  for (let k = 1; k <= 600; k++) {
    b = b * (1 + r) + m;
    if (b >= target) return label(k);
  }
  return '';
};
const scenarios = [0.8, 1, 1.2].map((f) => ({ plan: f === 1 ? 'As planned' : f < 1 ? '20% less' : '20% more', monthly: round(plan * f), reach: plan * f > 0 ? reach(plan * f) : '' }));
const milestones = [25, 50, 75, 100].map((p) => ({ pct: p, month: (rows.find((x) => x.balance >= (target * p) / 100) || {}).month || '' }));
return { months, needed: round(needed), plan: round(plan), final: round(bal), short: round(Math.max(0, target - bal)), rows, scenarios, milestones, reach: reach(plan) || '' };`,
          outputs: [
            { id: 'months', label: 'Months to go', type: 'number' },
            { id: 'needed', label: 'It takes a month', type: 'number' },
            { id: 'plan', label: 'Put aside a month', type: 'number' },
            { id: 'final', label: 'At the date', type: 'number' },
            { id: 'short', label: 'Short of the goal', type: 'number' },
            { id: 'rows', label: 'Month by month', type: 'table', columns: SAVING_COLS },
            { id: 'scenarios', label: 'If you save more or less', type: 'table', columns: [{ id: 'plan', label: 'Plan', type: 'text' }, { id: 'monthly', label: 'A month', type: 'number' }, { id: 'reach', label: 'Goal reached', type: 'text' }] },
            { id: 'milestones', label: 'Milestones', type: 'table', columns: [{ id: 'pct', label: 'Of the goal, %', type: 'number' }, { id: 'month', label: 'Month', type: 'text' }] },
            { id: 'reach', label: 'Goal reached', type: 'text' },
          ],
          failed: 'agent',
        },
        {
          id: 'advice',
          title: 'Say how it looks',
          do: 'model',
          instructions: `Say in plain words how this savings plan looks{{#goal}} for {{goal}}{{/goal}}, and give a few practical tips. Amounts in {{#currency}}{{currency}}{{/currency}}{{^currency}}their currency{{/currency}}.

Goal: {{target}} by {{by}} ({{project.months}} months), saved already: {{saved}}, interest: {{rate}}% a year.
It takes {{project.needed}} a month; the plan puts aside {{project.plan}} a month, which gives {{project.final}} by then{{#project.short}}, {{project.short}} short{{/project.short}}{{#project.reach}}, and reaches the goal in {{project.reach}}{{/project.reach}}.
Saving more or less: {{project.scenarios}}

- summary: two or three sentences: whether the plan gets there and what it takes.
- tips: three to five tips (automating it, where to keep the money, small cuts), with no product named; not financial advice.`,
          outputs: [{ id: 'summary', label: 'In short', type: 'markdown', required: true }, { id: 'tips', label: 'Tips', type: 'list' }],
        },
      ],
      outputs: { summary: '{{advice.summary}}', needed: '{{project.needed}}', plan: '{{project.plan}}', months: '{{project.months}}', final: '{{project.final}}', reach: '{{project.reach}}', rows: '{{project.rows}}', scenarios: '{{project.scenarios}}', milestones: '{{project.milestones}}', tips: '{{advice.tips}}' },
    },
    answer: [
      { id: 'summary', label: 'In short', type: 'markdown', required: true },
      { id: 'needed', label: 'It takes a month', type: 'number', required: true },
      { id: 'plan', label: 'Put aside a month', type: 'number' },
      { id: 'months', label: 'Months to go', type: 'number' },
      { id: 'final', label: 'At the date', type: 'number' },
      { id: 'reach', label: 'Goal reached', type: 'text', description: 'The month the goal is reached, as YYYY-MM' },
      { id: 'rows', label: 'Month by month', type: 'table', columns: SAVING_COLS },
      { id: 'scenarios', label: 'If you save more or less', type: 'table', columns: [{ id: 'plan', label: 'Plan', type: 'text' }, { id: 'monthly', label: 'A month', type: 'number' }, { id: 'reach', label: 'Goal reached', type: 'text' }] },
      { id: 'milestones', label: 'Milestones', type: 'table', columns: [{ id: 'pct', label: 'Of the goal, %', type: 'number' }, { id: 'month', label: 'Month', type: 'text' }] },
      { id: 'tips', label: 'Tips', type: 'list' },
    ],
    examples: [
      { id: 'a-deposit', name: 'A deposit in three years', inputs: { goal: 'A house deposit', target: 20000, by: '2031-01-01', saved: 2000, rate: 3, currency: '€' }, checks: ['{{answer.needed}} > 0', '{{answer.rows}} is not empty'] },
      { id: 'at-a-set-amount', name: 'At a set amount a month', inputs: { target: 5000, by: '2030-12-01', monthly: 200, rate: 0 }, checks: ['{{answer.plan}} = 200', '{{answer.reach}} is not empty'] },
    ],
  },
  // ---- charts, timelines, places ---------------------------------------------------------------------------------
  {
    id: 'chart-my-data',
    name: 'Chart my data',
    icon: 'chart',
    color: 'blue',
    category: 'Work',
    description: 'A spreadsheet, a CSV or numbers you paste, turned into clear charts, with the totals, trends and what stands out in a few plain sentences.',
    fields: [
      { id: 'file', label: 'A spreadsheet or CSV', type: 'file', help: 'Excel, CSV or OpenDocument' },
      { id: 'data', label: 'Or paste the numbers', type: 'long', placeholder: 'e.g. Month, Sales, Costs\nJan, 120, 80\nFeb, 135, 82' },
      { id: 'question', label: 'What you want to see', type: 'text', placeholder: 'e.g. How sales changed by month and region' },
    ],
    prompt: '',
    flow: {
      steps: [
        { id: 'read', title: 'Read the file', do: 'tool', tool: 'read_document', if: '{{file}} is not empty', with: { path: '{{file}}', limit: 2000 }, failed: 'agent' },
        {
          id: 'parse',
          title: 'Read the table',
          do: 'code',
          language: 'javascript',
          with: { file: '{{read.text}}', pasted: '{{data}}' },
          code: String.raw`// The table: from the file (the first sheet's table, its row numbers and column letters left out) or as pasted (commas,
// tabs, semicolons or a Markdown table), its first row the names when it reads as words; each column's kind (numbers,
// dates or words) and what sums it up.
const src = String(input.file || '').trim() ? String(input.file) : String(input.pasted || '');
let lines = src.split('\n').map((l) => l.replace(/^\s*\d+\t/, ''));
let table = [];
const md = lines.filter((l) => /^\s*\|.*\|\s*$/.test(l) && !/^\s*\|[\s:|-]+\|\s*$/.test(l));
if (md.length >= 2) {
  table = md.map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  // A sheet read from a file: its column letters first, each row's number in front.
  if (table[0].slice(1).every((c) => /^[A-Z]{1,3}$/.test(c)) && !table[0][0]) table = table.slice(1).map((r) => r.slice(1));
} else {
  lines = lines.filter((l) => l.trim() && !/^#+ /.test(l));
  const count = (c) => (lines[0] || '').split(c).length - 1;
  const sep = ['\t', ';', ','].sort((a, b) => count(b) - count(a))[0];
  table = lines.map((l) => {
    if (count(sep) > 0) return l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const m = /^(.*?)[\s:=]+(-?[\d.,]+%?)\s*$/.exec(l.trim());
    return m ? [m[1], m[2]] : [l.trim()];
  });
}
table = table.filter((r) => r.some((c) => c !== ''));
if (table.length < 2) throw new Error('Give a table with at least two rows: attach a spreadsheet, or paste the numbers');
const width = Math.max(...table.map((r) => r.length));
const asNum = (v) => {
  const t = String(v || '').trim().replace(/[$€£¥%\s]/g, '').replace(/,(?=\d{3}(\D|$))/g, '');
  return /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(t) ? Number(t) : null;
};
const isDate = (v) => /^\d{4}-\d{2}(-\d{2})?$|^\d{1,2}\/\d{1,2}\/\d{2,4}$|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?( \d{2,4})?$|^(q[1-4]|h[12])( \d{4})?$|^(19|20)\d{2}$/i.test(String(v || '').trim());
const head = table[0].every((c) => asNum(c) === null) ? table[0] : table[0].map((_c, i) => 'Column ' + (i + 1));
const body = (table[0] === head ? table.slice(1) : table).slice(0, 2000);
const names = Array.from({ length: width }, (_v, i) => String(head[i] || 'Column ' + (i + 1)).trim() || 'Column ' + (i + 1));
const columns = names.map((name, i) => {
  const vals = body.map((r) => r[i]).filter((v) => v !== undefined && String(v).trim() !== '');
  const nums = vals.map(asNum).filter((n) => n !== null);
  const kind = vals.length && vals.every(isDate) ? 'date' : nums.length >= vals.length * 0.8 && nums.length ? 'number' : 'text';
  const sum = nums.reduce((a, b) => a + b, 0);
  return { name, kind, filled: vals.length, distinct: new Set(vals).size, min: kind === 'number' ? Math.min(...nums) : null, max: kind === 'number' ? Math.max(...nums) : null, mean: kind === 'number' ? Math.round((sum / nums.length) * 100) / 100 : null, total: kind === 'number' ? Math.round(sum * 100) / 100 : null };
});
const records = body.map((r) => Object.fromEntries(names.map((n, i) => [n, columns[i].kind === 'number' ? asNum(r[i]) : String(r[i] === undefined ? '' : r[i]).trim()])));
const preview = ['| ' + names.join(' | ') + ' |', '|' + ' --- |'.repeat(names.length), ...body.slice(0, 25).map((r) => '| ' + names.map((_n, i) => String(r[i] === undefined ? '' : r[i]).replace(/\|/g, '/')).join(' | ') + ' |')].join('\n');
return { columns, records, preview, rows: body.length };`,
          outputs: [
            { id: 'columns', label: 'Columns', type: 'table', columns: [{ id: 'name', label: 'Column', type: 'text' }, { id: 'kind', label: 'Kind', type: 'text' }, { id: 'filled', label: 'Filled', type: 'number' }, { id: 'distinct', label: 'Different values', type: 'number' }, { id: 'min', label: 'Smallest', type: 'number' }, { id: 'max', label: 'Largest', type: 'number' }, { id: 'mean', label: 'Average', type: 'number' }, { id: 'total', label: 'Total', type: 'number' }] },
            { id: 'records', label: 'Rows', type: 'list' },
            { id: 'preview', label: 'The first rows', type: 'markdown' },
            { id: 'rows', label: 'How many rows', type: 'number' },
          ],
          failed: 'agent',
        },
        {
          id: 'plan',
          title: 'Choose the charts',
          do: 'model',
          instructions: `Choose up to three charts that show this table best{{#question}}, for this question: {{question}}{{/question}}, and say what it shows.

Its columns (kind, how many filled, smallest, largest, average, total):
{{parse.columns}}

Its first rows (of {{parse.rows}}):
{{parse.preview}}

- charts: each its kind (line for change over time, bar to compare, pie for shares of a whole with few parts, scatter for two measures), a title, the column for the x axis (or a pie's labels), the column of numbers (y), a column to split it into series when that helps (else empty), and how to add up rows that share an x (sum, average or none).
- summary: what the data shows, in two or three sentences.
- findings: three to five findings, with the numbers: totals, the biggest and smallest, trends, anything that stands out.`,
          outputs: [
            { id: 'charts', label: 'Charts', type: 'table', required: true, columns: [{ id: 'kind', label: 'Kind', type: 'text' }, { id: 'title', label: 'Title', type: 'text' }, { id: 'x', label: 'X axis', type: 'text' }, { id: 'y', label: 'Numbers', type: 'text' }, { id: 'series', label: 'Series', type: 'text' }, { id: 'combine', label: 'Add up', type: 'text' }] },
            { id: 'summary', label: 'What it shows', type: 'markdown', required: true },
            { id: 'findings', label: 'Findings', type: 'list' },
          ],
        },
        {
          id: 'build',
          title: 'Draw the charts',
          do: 'code',
          language: 'javascript',
          with: { charts: '{{plan.charts}}', records: '{{parse.records}}', columns: '{{parse.columns}}' },
          code: String.raw`// Each chart's points from the rows: the column for x, the numbers, the series, rows sharing an x added up (or
// averaged) as asked; at most 300 points. A chart naming no column it has is left out.
const rows = Array.isArray(input.records) ? input.records : [];
const cols = (Array.isArray(input.columns) ? input.columns : []).map((c) => c.name);
const find = (n) => cols.find((c) => c.toLowerCase() === String(n || '').toLowerCase().trim()) || '';
const charts = [];
const points = [];
for (const c of Array.isArray(input.charts) ? input.charts : []) {
  const kind = ['line', 'bar', 'pie', 'scatter', 'area'].includes(String(c.kind).toLowerCase()) ? String(c.kind).toLowerCase() : 'bar';
  const x = find(c.x);
  const y = find(c.y);
  const s = find(c.series);
  if (!x || !y || charts.length >= 3) continue;
  const n = charts.length + 1;
  const groups = new Map();
  for (const r of rows) {
    const v = typeof r[y] === 'number' ? r[y] : null;
    if (v === null) continue;
    const key = String(r[x]) + '\u0000' + (s ? String(r[s]) : '');
    const g = groups.get(key) || { x: String(r[x]), series: s ? String(r[s]) : '', sum: 0, n: 0 };
    g.sum += v;
    g.n++;
    groups.set(key, g);
  }
  const how = String(c.combine || '').toLowerCase();
  const list = [...groups.values()].slice(0, 300).map((g) => ({ chart: n, x: g.x, y: Math.round((how.startsWith('av') ? g.sum / g.n : g.sum) * 100) / 100, series: g.series }));
  if (!list.length) continue;
  charts.push({ n, kind, title: String(c.title || y + ' by ' + x), x_label: x, y_label: y });
  points.push(...list);
}
if (!charts.length) throw new Error('No chart could be drawn from those columns');
return { charts, points };`,
          outputs: [
            { id: 'charts', label: 'Charts', type: 'table', columns: [{ id: 'n', label: 'Chart', type: 'number' }, { id: 'kind', label: 'Kind', type: 'text' }, { id: 'title', label: 'Title', type: 'text' }, { id: 'x_label', label: 'X axis', type: 'text' }, { id: 'y_label', label: 'Numbers', type: 'text' }] },
            { id: 'points', label: 'Points', type: 'table', columns: [{ id: 'chart', label: 'Chart', type: 'number' }, { id: 'x', label: 'X', type: 'text' }, { id: 'y', label: 'Y', type: 'number' }, { id: 'series', label: 'Series', type: 'text' }] },
          ],
          failed: 'agent',
        },
      ],
      outputs: { summary: '{{plan.summary}}', findings: '{{plan.findings}}', charts: '{{build.charts}}', points: '{{build.points}}', columns: '{{parse.columns}}', rows: '{{parse.rows}}' },
    },
    answer: [
      { id: 'summary', label: 'What it shows', type: 'markdown', required: true },
      { id: 'findings', label: 'Findings', type: 'list' },
      { id: 'charts', label: 'Charts', type: 'table', required: true, columns: [{ id: 'n', label: 'Chart', type: 'number' }, { id: 'kind', label: 'Kind', type: 'text' }, { id: 'title', label: 'Title', type: 'text' }, { id: 'x_label', label: 'X axis', type: 'text' }, { id: 'y_label', label: 'Numbers', type: 'text' }] },
      { id: 'points', label: 'Points', type: 'table', columns: [{ id: 'chart', label: 'Chart', type: 'number' }, { id: 'x', label: 'X', type: 'text' }, { id: 'y', label: 'Y', type: 'number' }, { id: 'series', label: 'Series', type: 'text' }] },
      { id: 'columns', label: 'Columns', type: 'table', columns: [{ id: 'name', label: 'Column', type: 'text' }, { id: 'kind', label: 'Kind', type: 'text' }, { id: 'filled', label: 'Filled', type: 'number' }, { id: 'distinct', label: 'Different values', type: 'number' }, { id: 'min', label: 'Smallest', type: 'number' }, { id: 'max', label: 'Largest', type: 'number' }, { id: 'mean', label: 'Average', type: 'number' }, { id: 'total', label: 'Total', type: 'number' }] },
      { id: 'rows', label: 'Rows', type: 'number' },
    ],
    examples: [
      { id: 'sales-by-month', name: 'Sales by month', inputs: { data: 'Month, Sales, Costs\nJan, 120, 80\nFeb, 135, 82\nMar, 150, 90\nApr, 140, 95\nMay, 170, 99\nJun, 185, 101', question: 'How did sales and costs change?' }, checks: ['{{parse.rows}} = 6', '{{answer.charts}} is not empty'] },
      { id: 'label-and-number', name: 'A list of labels and numbers', inputs: { data: 'Rent: 1200\nFood: 450\nTransport: 120\nFun: 200\nSavings: 300' }, checks: ['{{parse.rows}} >= 4'] },
    ],
  },
  {
    id: 'topic-timeline',
    name: 'A topic as a timeline',
    icon: 'history',
    color: 'indigo',
    category: 'Learning',
    description: 'Any topic, from a war to a technology, as a timeline you can scroll and see on a chart: its key moments with dates, its eras, and the story in short.',
    fields: [
      { id: 'topic', label: 'Topic', type: 'text', required: true, placeholder: 'e.g. The space race, the history of jazz, the iPhone' },
      { id: 'detail', label: 'How much', type: 'choice', options: ['Key moments', 'In depth'], default: 'Key moments' },
    ],
    prompt: '',
    flow: {
      steps: [
        { id: 'wiki', title: 'Find the topic on Wikipedia', do: 'tool', tool: 'http_request', with: { url: 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&list=search&srlimit=5&srsearch={{topic}}', headers: HEADERS }, failed: 'skip' },
        {
          id: 'page',
          title: 'Pick its page',
          do: 'code',
          language: 'javascript',
          with: { found: '{{wiki}}' },
          code:
            BODY +
            String.raw`// The page to read: a "Timeline of…" or "History of…" page among the first results, else the first.
const hits = ((bodyOf(input.found) || {}).query || {}).search || [];
const hit = hits.find((h) => /^(timeline|history) of /i.test(h.title)) || hits[0];
return hit ? { title: hit.title, url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(hit.title.replace(/ /g, '_')) } : { title: '', url: null };`,
          outputs: [{ id: 'title', label: 'Its page', type: 'text' }, { id: 'url', label: 'Address', type: 'url' }],
          failed: 'agent',
        },
        { id: 'article', title: 'Read it', do: 'tool', tool: 'read_page', if: '{{page.url}} is not empty', with: { url: '{{page.url}}', question: 'Dates and events of {{topic}}, in order: what happened when' }, failed: 'skip' },
        {
          id: 'events',
          title: 'Pick out the moments',
          do: 'model',
          instructions: `Make a timeline of {{topic}}: {{#detail}}{{detail}}{{/detail}} ({{^article.text}}from what is well established{{/article.text}}{{#article.text}}from the article below, and what is well established{{/article.text}}). Key moments means twelve to fifteen; in depth, up to thirty.
{{#article.text}}
{{page.title}} (Wikipedia):
{{article.text}}
{{/article.text}}
- events: in order: the year (a number; negative before the common era), the date as precisely as known (like "20 July 1969", "1960s"), what happened in a few words, what happened and why it mattered in a sentence or two, its kind (one word, the same for events of one strand: Politics, Science, People, War, Culture…), and how much it matters, from 1 (a detail) to 3 (a turning point).
- eras: the periods it falls into, each its name and first and last year.
- summary: the story in three or four sentences.`,
          outputs: [
            { id: 'events', label: 'Events', type: 'table', required: true, columns: [{ id: 'year', label: 'Year', type: 'number' }, { id: 'date', label: 'When', type: 'text' }, { id: 'title', label: 'What happened', type: 'text' }, { id: 'what', label: 'In a few sentences', type: 'text' }, { id: 'kind', label: 'Kind', type: 'text' }, { id: 'importance', label: 'How much it matters', type: 'number' }] },
            { id: 'eras', label: 'Eras', type: 'table', columns: [{ id: 'name', label: 'Era', type: 'text' }, { id: 'from', label: 'From', type: 'number' }, { id: 'to', label: 'To', type: 'number' }] },
            { id: 'summary', label: 'The story', type: 'markdown', required: true },
          ],
        },
        {
          id: 'order',
          title: 'Put them in order',
          do: 'code',
          language: 'javascript',
          with: { events: '{{events.events}}', eras: '{{events.eras}}' },
          code:
            LIST +
            String.raw`// The events in order of their year, each in its era, how much each matters kept between 1 and 3; the span it covers.
const eras = rows(input.eras).map((e) => ({ name: String(e.name || ''), from: num(e.from), to: num(e.to) })).filter((e) => e.name && e.from !== null);
const events = rows(input.events)
  .map((e) => ({ year: num(e.year), date: String(e.date || e.year || ''), title: String(e.title || ''), what: String(e.what || ''), kind: String(e.kind || 'Other'), importance: Math.min(3, Math.max(1, Math.round(num(e.importance) || 2))) }))
  .filter((e) => e.year !== null && e.title)
  .sort((a, b) => a.year - b.year);
if (!events.length) throw new Error('No dated moments came out of it: try naming the topic another way');
const era = (y) => (eras.find((e) => y >= e.from && y <= (e.to === null ? Infinity : e.to)) || {}).name || '';
const shown = (y) => (y < 0 ? -y + ' BCE' : String(y));
const kinds = [...new Set(events.map((e) => e.kind))];
const figure = {
  data: kinds.map((k) => {
    const of = events.filter((e) => e.kind === k);
    return { type: 'scatter', mode: 'markers', name: k, x: of.map((e) => e.year), y: of.map(() => k), text: of.map((e) => e.date + ': ' + e.title), hovertemplate: '%{text}<extra></extra>', marker: { size: of.map((e) => 8 + e.importance * 6), opacity: 0.85 } };
  }),
  layout: { showlegend: false, yaxis: { type: 'category', automargin: true }, xaxis: { zeroline: false }, margin: { l: 90 } },
};
return { events: events.map((e) => ({ ...e, era: era(e.year) })), eras, span: shown(events[0].year) + '–' + shown(events[events.length - 1].year), count: events.length, figure: JSON.stringify(figure) };`,
          outputs: [
            { id: 'events', label: 'Events', type: 'table', columns: [...TIMELINE_COLS, { id: 'era', label: 'Era', type: 'text' }] },
            { id: 'eras', label: 'Eras', type: 'table', columns: [{ id: 'name', label: 'Era', type: 'text' }, { id: 'from', label: 'From', type: 'number' }, { id: 'to', label: 'To', type: 'number' }] },
            { id: 'span', label: 'Span', type: 'text' },
            { id: 'count', label: 'How many', type: 'number' },
            { id: 'figure', label: 'On a chart', type: 'text', description: 'A Plotly figure, as JSON' },
          ],
          failed: 'agent',
        },
      ],
      outputs: { title: '{{page.title}}', summary: '{{events.summary}}', events: '{{order.events}}', eras: '{{order.eras}}', span: '{{order.span}}', figure: '{{order.figure}}', source: '{{page.url}}' },
    },
    answer: [
      { id: 'title', label: 'Read more', type: 'text' },
      { id: 'summary', label: 'The story', type: 'markdown', required: true },
      { id: 'events', label: 'Events', type: 'table', required: true, columns: [...TIMELINE_COLS, { id: 'era', label: 'Era', type: 'text' }] },
      { id: 'eras', label: 'Eras', type: 'table', columns: [{ id: 'name', label: 'Era', type: 'text' }, { id: 'from', label: 'From', type: 'number' }, { id: 'to', label: 'To', type: 'number' }] },
      { id: 'span', label: 'Span', type: 'text' },
      { id: 'figure', label: 'On a chart', type: 'text', description: 'A Plotly figure, as JSON' },
      { id: 'source', label: 'Source', type: 'url' },
    ],
    examples: [
      { id: 'the-space-race', name: 'The space race', inputs: { topic: 'The space race' }, checks: ['{{order.count}} >= 10', '{{answer.events}} contains 1969'] },
      { id: 'ancient-rome', name: 'Ancient Rome, in depth', inputs: { topic: 'Ancient Rome', detail: 'In depth' }, checks: ['{{order.count}} >= 15'] },
    ],
  },
  {
    id: 'place-explorer',
    name: 'Explore a place',
    icon: 'map-pin',
    color: 'teal',
    category: 'Research',
    description: 'What is around any place, on a map: sights, museums, parks and landmarks with pictures and a line on each, the best for you picked out and put in walking order.',
    fields: [
      { id: 'place', label: 'Where', type: 'text', required: true, placeholder: 'e.g. Alfama, Lisbon, or the Colosseum' },
      { id: 'interests', label: 'What you like', type: 'text', placeholder: 'e.g. History, architecture, views, quiet parks' },
      { id: 'radius', label: 'How far around', type: 'choice', options: ['A short walk (1 km)', 'Nearby (3 km)', 'The wider area (10 km)'], default: 'Nearby (3 km)' },
    ],
    prompt: '',
    flow: {
      steps: [
        { id: 'search', title: 'Look the place up', do: 'tool', tool: 'http_request', with: { url: 'https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json&name={{place}}' }, failed: 'skip' },
        {
          id: 'spot',
          title: 'Pick the place',
          do: 'code',
          language: 'javascript',
          with: { found: '{{search}}', place: '{{place}}', radius: '{{radius}}' },
          code:
            BODY +
            PLACE +
            String.raw`// The place: OpenStreetMap's search knows sights as well as towns, the best known first ("Colosseum" is Rome's); a
// little-known hit (a name a building site somewhere shares) gives way to Open-Meteo's towns.
let p = null;
try {
  const r = await ctx.tool('http_request', { url: 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&q=' + encodeURIComponent(String(input.place || '')), headers: { 'User-Agent': '${UA}' } }, { title: 'Look it up on OpenStreetMap' });
  const hit = (bodyOf(r) || [])[0];
  if (hit && isFinite(Number(hit.lat)) && isFinite(Number(hit.lon)) && Number(hit.importance) >= 0.4) {
    const parts = String(hit.display_name || '').split(', ');
    const name = hit.name || parts[0] || String(input.place);
    p = { name, label: [name, parts.length > 1 ? parts[parts.length - 1] : ''].filter(Boolean).join(', '), lat: Number(hit.lat), lng: Number(hit.lon) };
  }
} catch (e) {}
if (!p) p = await placeOf(input.found, input.place, ctx);
if (!p) throw new Error('No place called “' + input.place + '” was found: check its spelling, or add its city');
// Where to ask what is around it: Wikidata, for everything with a place on the map there and how well known each is
// (how many Wikipedias write about it); Wikipedia, for its articles there, with their pictures.
const m = /(\d+) km/.exec(String(input.radius || ''));
const km = Math.min(10, m ? Number(m[1]) : 3);
// The best known hundred first, then pictures, articles and names for those alone: quick in a big city too. A work held
// in a collection (a painting, a statue in a museum) is marked, to leave out.
const q = 'SELECT ?item ?itemLabel ?itemDescription ?loc ?links ?image ?article ?held WHERE { { SELECT ?item ?loc ?links WHERE { SERVICE wikibase:around { ?item wdt:P625 ?loc . bd:serviceParam wikibase:center "Point(' + p.lng + ' ' + p.lat + ')"^^geo:wktLiteral . bd:serviceParam wikibase:radius "' + km + '" . } ?item wikibase:sitelinks ?links . FILTER(?links >= 2) } ORDER BY DESC(?links) LIMIT 100 } OPTIONAL { ?item wdt:P18 ?image } OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> } BIND(EXISTS { ?item wdt:P195 [] } AS ?held) SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul" . } } ORDER BY DESC(?links)';
const wikidata = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q);
const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&generator=geosearch&ggslimit=200&ggsradius=' + km * 1000 + '&ggscoord=' + p.lat + '|' + p.lng + '&prop=coordinates|pageimages|description|info&colimit=max&coprop=type&pilimit=max&piprop=thumbnail&pithumbsize=500&inprop=url';
return { label: p.label, name: p.name, lat: p.lat, lng: p.lng, at: p.lat + ',' + p.lng, wikidata, url };`,
          outputs: [
            { id: 'label', label: 'Place', type: 'text' },
            { id: 'name', label: 'Its name', type: 'text' },
            { id: 'lat', label: 'Latitude', type: 'number' },
            { id: 'lng', label: 'Longitude', type: 'number' },
            { id: 'at', label: 'Where on a map', type: 'text' },
            { id: 'wikidata', label: 'What is best known around it', type: 'url' },
            { id: 'url', label: 'What is around it', type: 'url' },
          ],
          failed: 'agent',
        },
        { id: 'famous', title: 'Find what is best known there', do: 'tool', tool: 'http_request', with: { url: '{{spot.wikidata}}', headers: { ...HEADERS, Accept: 'application/sparql-results+json' }, max_chars: 200000 }, failed: 'skip' },
        { id: 'nearby', title: 'Find what is around', do: 'tool', tool: 'http_request', with: { url: '{{spot.url}}', headers: HEADERS, max_chars: 200000 }, failed: 'skip' },
        {
          id: 'sort',
          title: 'Sort what is there',
          do: 'code',
          language: 'javascript',
          with: { famous: '{{famous}}', found: '{{nearby}}', name: '{{spot.name}}', lat: '{{spot.lat}}', lng: '{{spot.lng}}' },
          code:
            BODY +
            String.raw`// The places around it, the best known first: Wikidata's, by how many Wikipedias write about each, and Wikipedia's
// articles there, by how much each says (either alone when the other did not answer). What is no place to go (the place
// itself and other towns and areas, events, states, institutions, languages) is left out; schools, firms, stations,
// roads and a World Heritage listing of many sites go lower.
const lat0 = Number(input.lat);
const lng0 = Number(input.lng);
const away = (lat, lng) => Math.round(Math.hypot((lat - lat0) * 111.2, (lng - lng0) * 111.2 * Math.cos((lat0 * Math.PI) / 180)) * 10) / 10;
const KINDS = [
  ['Museum', /museum|gallery/i],
  ['Religious site', /church|cathedral|chapel|basilica|monastery|convent|abbey|mosque|temple|synagogue|shrine|rotunda/i],
  ['Park', /park|garden|botanical|forest|beach|lake|river|viewpoint|nature|promenade|waterfront|seafront|\bhill|mountain/i],
  ['Square', /square|plaza|piazza|street|avenue|boulevard/i],
  ['Building', /palace|castle|fort|walls?\b|gate|arch\b|tower|house|building|bridge|monument|statue|memorial|column|obelisk|lighthouse|aqueduct|ruins?|archaeological|ancient|circus|forum|agora|amphitheatre|theatre|theater|library|opera|hall|station|market|bazaar|bath|hamam|hammam|fountain|harbou?r|port\b/i],
  ['Area', /neighbou?rhood|district|quarter|old town|upper town|village|area/i],
];
const AREA = /^(?:\S+\s+){0,2}(?:city|town|village|hamlet|suburb|municipality|municipal unit|commune|county|province|region|prefecture|state|country|capital|human settlement|(?:metropolitan|urban) area|census[- ]designated place|unincorporated community|borough|ward|civil parish|constituency|arrondissement)(?:\s+(?:in|of|and|on|near|within|that|which|located)\b|,|$)|^(?:\S+\s+){0,3}(?:country|sovereign state|nation)\b/i;
const EVENT = /\b(?:siege|battle|massacre|conflagration|festival|exhibition|conference|congress|summit|earthquake|riot|treaty|agreement|election|referendum|uprising|revolt|revolution|pogrom|bombing|terrorist|attacks?|incident|accident|disaster|olympi\w*|championships?|tournament|crusader|empire|kingdom|dynasty|principality|regime|republic|legislature|parliament|agency|government|ministry|council|political party|intergovernmental|meeting|scandal|affair|stock exchange|(?:rapid )?(?:transit|transport) system|metro system|tram system|bus network|administrative (?:districts?|divisions?|units?|regions?)|language|dialect|ethnic group|diocese|archdiocese|vicariate|eparchy|bishopric|military unit|regiment)\b/i;
// A work of art kept in a museum (a painting, a sculpture) is seen in that museum, not where it was found.
const ART = /\b(?:sculpture|painting|fresco|statue|artwork|manuscript|tapestry)\b.*\b(?:in|at) the\b.*\b(?:museums?|museo|mus[ée]e|galleries|gallery|collection|vatican|louvre)\b/i;
const GROUP = (r) => /world heritage/i.test(r.about) && /\b(?:monuments|sites|churches|buildings|works|ensembles?)\b/i.test(r.name);
// An event's description starts with its year ("2019 church fire", "1894–1906 political scandal").
const DATED = /^\d{3,4}(?:[–-]\d{2,4})?\b(?!s)/;
const TOPIC = /^(?:siege|battle|kingdom|empire|treaty|massacre|great fire|history|list|timeline|demographics|economy|culture|politics|geography|transport|education|religion)\b/i;
const LESS = /\b(?:university|college|grande école|higher education|research (?:establishment|institute|centre|center)|school|faculty|institute|academy|hospital|clinic|company|bank|corporation|organi[sz]ation|association|federation|club|team|newspaper|broadcaster|consulate|embassy|headquarters|hotel|(?:metro|subway|railway|train|bus|tram) (?:station|stop|line)|railway|highway|motorway|interchange|tunnel|apartment|office|stadium|arena|cemetery|street|avenue|road)\b/i;
const titleOf = (u) => {
  try {
    return decodeURIComponent(String(u || '').split('/wiki/')[1] || '').replace(/_/g, ' ');
  } catch (e) {
    return '';
  }
};
const own = String(input.name || '').trim();
const plain = (s) => (own ? String(s).replace(new RegExp('(?:, ' + own.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&') + '| \\(' + own.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&') + '\\))$', 'i'), '') : String(s));
const all = new Map();
const add = (key, row) => {
  const had = all.get(key);
  if (!had) return all.set(key, row);
  for (const k of Object.keys(row)) if (had[k] === undefined || had[k] === null || had[k] === '') had[k] = row[k];
  had.fame = Math.max(had.fame, row.fame);
};
for (const b of ((bodyOf(input.famous) || {}).results || {}).bindings || []) {
  const v = (k) => (b[k] ? String(b[k].value) : '');
  const at = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(v('loc'));
  const name = v('itemLabel');
  if (!at || !name || /^Q\d+$/.test(name) || v('held') === 'true') continue;
  const links = Number(v('links')) || 0;
  add(titleOf(v('article')) || v('item'), { name: plain(name), about: v('itemDescription'), lat: Number(at[2]), lng: Number(at[1]), fame: links, langs: links, picture: v('image') ? v('image').replace(/^http:/, 'https:') + '?width=330' : null, link: v('article') || v('item').replace(/^http:/, 'https:') });
}
for (const p of ((bodyOf(input.found) || {}).query || {}).pages || []) {
  const c = p.coordinates && p.coordinates[0];
  if (!c || /^(?:event|country|adm)/.test(String(c.type || ''))) continue;
  add(p.title, { name: plain(p.title), about: String(p.description || ''), lat: c.lat, lng: c.lon, fame: Math.min(40, (Number(p.length) || 0) / 2500), langs: null, picture: p.thumbnail ? p.thumbnail.source : null, link: p.fullurl || null });
}
const places = [...all.values()]
  .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng) && !AREA.test(r.about) && !EVENT.test(r.about) && !DATED.test(r.about) && !ART.test(r.about) && !TOPIC.test(r.name))
  .map((r) => {
    const text = r.name + ' ' + r.about;
    const kind = (KINDS.find(([, re]) => re.test(text)) || ['Other'])[0];
    return { name: r.name, kind, about: r.about, km: away(r.lat, r.lng), lat: r.lat, lng: r.lng, picture: r.picture, link: r.link, langs: r.langs, fame: r.fame * (LESS.test(text) || GROUP(r) ? 0.3 : 1) };
  })
  // The district asked about is where the walk is, not a stop of it.
  .filter((r) => !(r.kind === 'Area' && own && r.name.toLowerCase() === own.toLowerCase()))
  .sort((a, b) => b.fame - a.fame)
  .slice(0, 40);
if (!places.length) throw new Error('Nothing around it is on Wikipedia or Wikidata: try a larger area, or a nearby town');
// Pictures for those without one, from their Wikipedia articles (all at once).
const need = places.filter((r) => !r.picture && /en\.wikipedia\.org\/wiki\//.test(String(r.link || '')));
if (need.length)
  try {
    const r = await ctx.tool('http_request', { url: 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=pageimages&piprop=thumbnail&pithumbsize=500&pilimit=max&titles=' + encodeURIComponent(need.map((x) => titleOf(x.link)).join('|')), headers: { 'User-Agent': '${UA}' } }, { title: 'Find their pictures' });
    const got = {};
    for (const pg of ((bodyOf(r) || {}).query || {}).pages || []) if (pg.thumbnail) got[pg.title] = pg.thumbnail.source;
    for (const x of need) x.picture = got[titleOf(x.link)] || null;
  } catch (e) {}
return {
  places: places.map(({ fame, langs, ...p }) => p),
  list: places.map((p, i) => i + 1 + '. ' + p.name + ' (' + p.kind + (p.about ? ', ' + p.about : '') + '; ' + p.km + ' km from the centre' + (p.langs ? '; in ' + p.langs + ' Wikipedias' : '') + ')').join('\n'),
};`,
          outputs: [
            { id: 'places', label: 'Places', type: 'table', columns: [{ id: 'name', label: 'Place', type: 'text' }, { id: 'kind', label: 'Kind', type: 'text' }, { id: 'about', label: 'What it is', type: 'text' }, { id: 'km', label: 'Km from the centre', type: 'number' }, { id: 'lat', label: 'Latitude', type: 'number' }, { id: 'lng', label: 'Longitude', type: 'number' }, { id: 'picture', label: 'Picture', type: 'url' }, { id: 'link', label: 'More about it', type: 'url' }] },
            { id: 'list', label: 'In a list', type: 'markdown' },
          ],
          failed: 'agent',
        },
        {
          id: 'pick',
          title: 'Pick the best for you',
          do: 'model',
          instructions: `Pick the places most worth a visit around {{spot.label}}{{#interests}} for someone who likes: {{interests}}{{/interests}}: six to ten from the numbered list below (none that are not on it), each by its number, with why go in a sentence.

The list puts the best known first and says how far each is from the centre of {{spot.label}}. {{#interests}}Let what they like decide, but keep the sights a first visit should not miss unless what they like rules them out.{{/interests}}{{^interests}}Keep the sights a first visit should not miss, then add variety where the list allows (a museum, a church or monument, a square or market, a park or a view).{{/interests}} Leave out what is no place to visit (a school, an office, a station, an event).

{{sort.list}}

- picks: each its number in the list, and why go, in one sentence a guide would write (no distances).
- summary: what the place is like and what to see there, in two or three sentences as a guide would write them; say nothing about the list, its distances or what you cannot check.`,
          outputs: [
            { id: 'picks', label: 'Picks', type: 'table', required: true, columns: [{ id: 'n', label: 'Number', type: 'number' }, { id: 'why', label: 'Why go', type: 'text' }] },
            { id: 'summary', label: 'In short', type: 'markdown', required: true },
          ],
        },
        {
          id: 'route',
          title: 'Put them in walking order',
          do: 'code',
          language: 'javascript',
          with: { places: '{{sort.places}}', picks: '{{pick.picks}}', lat: '{{spot.lat}}', lng: '{{spot.lng}}' },
          code:
            LIST +
            String.raw`// The picks in walking order (from the centre, each time to the nearest left), numbered as stops, then the rest; and how
// far the walk is.
const places = rows(input.places);
const why = {};
for (const p of rows(input.picks)) if (places[Number(p.n) - 1]) why[Number(p.n) - 1] = String(p.why || '');
const dist = (a, b) => Math.hypot((a.lat - b.lat) * 111.2, (a.lng - b.lng) * 111.2 * Math.cos((a.lat * Math.PI) / 180));
let at = { lat: Number(input.lat), lng: Number(input.lng) };
const left = Object.keys(why).map(Number);
const order = [];
let km = 0;
while (left.length) {
  left.sort((a, b) => dist(at, places[a]) - dist(at, places[b]));
  const i = left.shift();
  km += dist(at, places[i]);
  at = places[i];
  order.push(i);
}
const out = order.map((i, k) => ({ n: k + 1, ...places[i], why: why[i], pick: true })).concat(places.filter((_p, i) => !(i in why)).slice(0, 20).map((p) => ({ n: null, ...p, why: '', pick: false })));
return { places: out, walk: Math.round(km * 10) / 10, stops: order.length };`,
          outputs: [{ id: 'places', label: 'Places', type: 'table', columns: PLACE_COLS }, { id: 'walk', label: 'Walk, km', type: 'number' }, { id: 'stops', label: 'Stops', type: 'number' }],
          failed: 'agent',
        },
      ],
      outputs: { place: '{{spot.label}}', at: '{{spot.at}}', summary: '{{pick.summary}}', places: '{{route.places}}', walk: '{{route.walk}}', stops: '{{route.stops}}' },
    },
    answer: [
      { id: 'place', label: 'Place', type: 'text', required: true },
      { id: 'at', label: 'Where on a map', type: 'text' },
      { id: 'summary', label: 'In short', type: 'markdown', required: true },
      { id: 'places', label: 'Places', type: 'table', required: true, columns: PLACE_COLS },
      { id: 'walk', label: 'The walk, km', type: 'number' },
      { id: 'stops', label: 'Stops', type: 'number' },
    ],
    examples: [
      { id: 'thessaloniki', name: 'A whole city', inputs: { place: 'Thessaloniki' }, checks: ['{{answer.stops}} >= 6', '{{answer.places}} contains White Tower', '{{answer.places}} contains Rotunda'] },
      { id: 'alfama', name: 'Alfama, Lisbon', inputs: { place: 'Alfama, Lisbon', interests: 'History and views' }, checks: ['{{answer.stops}} >= 5', '{{answer.walk}} < 15'] },
      { id: 'a-landmark', name: 'Around a landmark', inputs: { place: 'Colosseum', radius: 'A short walk (1 km)' }, checks: ['{{answer.places}} is not empty'] },
    ],
  },
];
