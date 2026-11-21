// The free services apps' steps call (the ready-made apps' own look-ups), with what each gives and how gently it
// wants to be asked: flows space the calls they make to one (perSecond, shared by every step and run of the server)
// and keep its answers for a while (cacheSeconds; server/apps/sturdy.ts). The App builder's agent reads this table to
// pick a service an app can use without a key.

export interface AppService {
  id: string;
  name: string;
  /** Its hosts; a subdomain of one counts as it too. */
  hosts: string[];
  /** What it gives, in a line. */
  about: string;
  /** It answers without a key. */
  keyless: boolean;
  /** How many calls a second it takes from one server at most (1/3: one every 3 seconds); unset: no limit of ours. */
  perSecond?: number;
  /** How long its answers stay good, when longer than the five minutes flows keep a look-up (places, encyclopedias). */
  cacheSeconds?: number;
  /** Requests the ready-made apps make of it. */
  examples?: { what: string; url: string }[];
}

const DAY = 24 * 3600;

export const APP_SERVICES: AppService[] = [
  {
    id: 'open-meteo',
    name: 'Open-Meteo forecast',
    hosts: ['api.open-meteo.com'],
    about: 'Weather forecasts for a latitude and longitude: hourly and daily temperature, rain, wind, sunrise and sunset, up to 16 days ahead.',
    keyless: true,
    examples: [
      { what: 'The next seven days', url: 'https://api.open-meteo.com/v1/forecast?latitude=42.37&longitude=-72.52&timezone=auto&forecast_days=7&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' },
      { what: 'The next 48 hours, hour by hour', url: 'https://api.open-meteo.com/v1/forecast?latitude=42.37&longitude=-72.52&timezone=auto&forecast_hours=48&hourly=temperature_2m,precipitation,wind_speed_10m' },
    ],
  },
  {
    id: 'open-meteo-archive',
    name: 'Open-Meteo archive',
    hosts: ['archive-api.open-meteo.com'],
    about: 'Past weather since 1940, by day or hour, for a latitude and longitude: what a place is like in a given month.',
    keyless: true,
    cacheSeconds: DAY,
    examples: [{ what: 'May of last year, day by day', url: 'https://archive-api.open-meteo.com/v1/archive?latitude=38.72&longitude=-9.14&start_date=2025-05-01&end_date=2025-05-31&timezone=auto&daily=temperature_2m_max,temperature_2m_min,precipitation_sum' }],
  },
  {
    id: 'open-meteo-geocoding',
    name: 'Open-Meteo geocoding',
    hosts: ['geocoding-api.open-meteo.com'],
    about: 'Places by name: their latitude, longitude, country, time zone and population.',
    keyless: true,
    cacheSeconds: DAY,
    examples: [{ what: 'Where Lisbon is', url: 'https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json&name=Lisbon' }],
  },
  {
    id: 'nominatim',
    name: 'Nominatim (OpenStreetMap)',
    hosts: ['nominatim.openstreetmap.org'],
    about: 'Addresses and place names to coordinates, and back, from OpenStreetMap. One request a second at most.',
    keyless: true,
    perSecond: 1,
    cacheSeconds: DAY,
    examples: [{ what: 'Where an address is', url: 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&q=Amherst%2C%20Massachusetts' }],
  },
  {
    id: 'photon',
    name: 'Photon (Komoot)',
    hosts: ['photon.komoot.io'],
    about: 'Place search on OpenStreetMap data, near a point when one is given: names to coordinates and coordinates to names.',
    keyless: true,
    cacheSeconds: DAY,
    examples: [{ what: 'What is at a point', url: 'https://photon.komoot.io/api/?limit=1&lat=42.37&lon=-72.52' }],
  },
  {
    id: 'overpass',
    name: 'Overpass (OpenStreetMap)',
    hosts: ['overpass-api.de', 'overpass.openstreetmap.fr'],
    about: 'OpenStreetMap’s map data by tag around a point (cafés, playgrounds, dog parks…): a query sent with POST as data=…; often busy, so try the second server too.',
    keyless: true,
    examples: [{ what: 'Cafés within 1 km (POST, body data=[out:json][timeout:20];nwr["amenity"="cafe"](around:1000,42.37,-72.52);out center tags 200;)', url: 'https://overpass-api.de/api/interpreter' }],
  },
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    hosts: ['wikipedia.org', 'wikimedia.org'],
    about: 'Encyclopedia articles: search, summaries, pictures, and articles about places near a point (geosearch).',
    keyless: true,
    cacheSeconds: DAY,
    examples: [
      { what: 'The best article for a topic', url: 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&list=search&srlimit=5&srsearch=Maksutov%20telescope' },
      { what: 'Articles about places near a point', url: 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&generator=geosearch&ggslimit=50&ggsradius=3000&ggscoord=42.37%7C-72.52&prop=pageimages|description&piprop=thumbnail&pithumbsize=400' },
    ],
  },
  {
    id: 'wikidata',
    name: 'Wikidata',
    hosts: ['wikidata.org'],
    about: 'Facts as data (dates, places, people, what a thing is), by SPARQL query.',
    keyless: true,
    cacheSeconds: DAY,
    examples: [{ what: 'A SPARQL query, as JSON', url: 'https://query.wikidata.org/sparql?format=json&query=SELECT%20%3Fitem%20%3FitemLabel%20WHERE%20%7B%20%3Fitem%20wdt%3AP31%20wd%3AQ146%20.%20SERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22en%22%20%7D%20%7D%20LIMIT%205' }],
  },
  {
    id: 'openalex',
    name: 'OpenAlex',
    hosts: ['api.openalex.org'],
    about: 'Scholarly papers, authors and citations: new papers on a topic, an author’s papers, who cited a paper.',
    keyless: true,
    examples: [
      { what: 'New papers on a topic', url: 'https://api.openalex.org/works?filter=title_and_abstract.search:%22dense%20retrieval%22,from_publication_date:2026-01-01&sort=publication_date:desc&per-page=25' },
      { what: 'An author by name', url: 'https://api.openalex.org/authors?search=Hamed%20Zamani' },
    ],
  },
  {
    id: 'arxiv',
    name: 'arXiv',
    hosts: ['export.arxiv.org'],
    about: 'Preprints by search or by id, as an Atom feed. One request every 3 seconds at most.',
    keyless: true,
    perSecond: 1 / 3,
    examples: [
      { what: 'The newest preprints on a topic', url: 'https://export.arxiv.org/api/query?search_query=all:%22dense%20retrieval%22&sortBy=submittedDate&sortOrder=descending&start=0&max_results=10' },
      { what: 'One preprint by its id', url: 'https://export.arxiv.org/api/query?id_list=1706.03762' },
    ],
  },
  {
    id: 'semantic-scholar',
    name: 'Semantic Scholar',
    hosts: ['api.semanticscholar.org'],
    about: 'Papers, authors and citations. Answers without a key, slowly and often busy; a free key (SEMANTIC_SCHOLAR_API_KEY, in the x-api-key header) lets it answer more.',
    keyless: true,
    perSecond: 1,
    examples: [
      { what: 'Papers by words', url: 'https://api.semanticscholar.org/graph/v1/paper/search?query=dense%20retrieval&fields=title,year,citationCount&limit=10' },
      { what: 'One paper by its DOI', url: 'https://api.semanticscholar.org/graph/v1/paper/DOI:10.18653/v1/2020.emnlp-main.550?fields=title,citationCount' },
    ],
  },
  {
    id: 'open-library',
    name: 'Open Library',
    hosts: ['openlibrary.org'],
    about: 'Books by title or author: editions, first published year, pages, subjects and covers (covers.openlibrary.org).',
    keyless: true,
    examples: [{ what: 'A book by its title', url: 'https://openlibrary.org/search.json?limit=1&fields=key,title,author_name,first_publish_year,cover_i,number_of_pages_median,subject&title=Dune' }],
  },
  {
    id: 'themealdb',
    name: 'TheMealDB',
    hosts: ['themealdb.com'],
    about: 'Recipes: by name, by main ingredient, by cuisine, with ingredients, steps and a picture.',
    keyless: true,
    examples: [
      { what: 'Dishes with an ingredient', url: 'https://www.themealdb.com/api/json/v1/1/filter.php?i=chicken' },
      { what: 'A recipe by name', url: 'https://www.themealdb.com/api/json/v1/1/search.php?s=Arrabiata' },
    ],
  },
  {
    id: 'thesportsdb',
    name: 'TheSportsDB',
    hosts: ['thesportsdb.com'],
    about: 'Sports teams, their latest and next matches, leagues and players.',
    keyless: true,
    examples: [{ what: 'A team by name', url: 'https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=Arsenal' }],
  },
  {
    id: 'tvmaze',
    name: 'TVmaze',
    hosts: ['api.tvmaze.com'],
    about: 'TV shows: what one is about, its network, rating, episodes and when the next airs.',
    keyless: true,
    examples: [{ what: 'A show by name', url: 'https://api.tvmaze.com/singlesearch/shows?q=severance' }],
  },
  {
    id: 'cheapshark',
    name: 'CheapShark',
    hosts: ['cheapshark.com'],
    about: 'PC game prices across stores: the cheapest deal for a game now, and its lowest price ever.',
    keyless: true,
    examples: [{ what: 'A game’s prices', url: 'https://www.cheapshark.com/api/1.0/games?limit=5&title=hades' }],
  },
  {
    id: 'github-raw',
    name: 'GitHub files (ccfddl, ai-deadlines)',
    hosts: ['raw.githubusercontent.com'],
    about: 'Files of public repositories as they are: conference deadlines from ccfddl and Hugging Face’s ai-deadlines, as YAML.',
    keyless: true,
    examples: [
      { what: 'A conference’s deadlines in ccfddl', url: 'https://raw.githubusercontent.com/ccfddl/ccf-deadlines/main/conference/AI/iclr.yml' },
      { what: 'A conference’s deadlines in ai-deadlines', url: 'https://raw.githubusercontent.com/huggingface/ai-deadlines/main/src/data/conferences/neurips.yml' },
    ],
  },
  {
    id: 'hugging-face',
    name: 'Hugging Face',
    hosts: ['huggingface.co'],
    about: 'Models and datasets on the Hub: the newest by task, their downloads and likes, and a dataset’s rows (datasets-server).',
    keyless: true,
    examples: [
      { what: 'The newest models for a task', url: 'https://huggingface.co/api/models?pipeline_tag=text-generation&sort=createdAt&direction=-1&limit=50' },
      { what: 'A dataset’s first rows', url: 'https://datasets-server.huggingface.co/rows?dataset=stanfordnlp/imdb&config=plain_text&split=train&offset=0&length=10' },
    ],
  },
  {
    id: 'frankfurter',
    name: 'Frankfurter',
    hosts: ['api.frankfurter.dev'],
    about: 'Exchange rates from central banks and official sources, for over 200 currencies: today’s, a past day’s, or a period of days.',
    keyless: true,
    examples: [
      { what: 'One rate, today: { date, base, quote, rate }', url: 'https://api.frankfurter.dev/v2/rate/eur/usd' },
      { what: 'Several rates from one currency', url: 'https://api.frankfurter.dev/v2/rates?base=eur&quotes=usd,gbp,jpy' },
      { what: 'One rate over a period', url: 'https://api.frankfurter.dev/v2/rates?from=2026-10-01&to=2026-10-31&base=usd&quotes=eur' },
    ],
  },
];

/** The service a host belongs to (one of its hosts, or a subdomain of one), if it is in the table. */
export function serviceOf(host: string): AppService | undefined {
  const h = String(host ?? '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
  if (!h) return undefined;
  return APP_SERVICES.find((s) => s.hosts.some((x) => h === x || h.endsWith(`.${x}`)));
}
